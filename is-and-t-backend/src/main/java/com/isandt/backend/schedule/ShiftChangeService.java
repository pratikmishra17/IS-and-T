package com.isandt.backend.schedule;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.isandt.backend.activity.ActivityLog;
import com.isandt.backend.calendar.Semester;
import com.isandt.backend.calendar.SemesterService;
import com.isandt.backend.common.error.ConflictException;
import com.isandt.backend.common.error.NotFoundException;
import com.isandt.backend.schedule.ShiftChangeDtos.ChangeRequest;
import com.isandt.backend.schedule.ShiftChangeDtos.ChangeResponse;
import com.isandt.backend.schedule.ShiftChangeDtos.Hours;
import com.isandt.backend.schedule.ShiftChangeRequest.Block;
import com.isandt.backend.schedule.ShiftChangeRequest.Scope;
import com.isandt.backend.schedule.ShiftChangeRequest.Status;
import com.isandt.backend.user.AdminRepository;
import com.isandt.backend.user.Student;
import com.isandt.backend.user.StudentRepository;

/**
 * Students asking to change their shifts, and admins answering. Approving applies the change:
 * <ul>
 * <li>ONE_DAY: that date gets one-off changes. The weekly shift is called off for the day (CANCEL),
 * any extra shifts already that day are replaced, and each new block becomes an extra shift.</li>
 * <li>EVERY_WEEK: that weekday's weekly shifts are replaced by the new blocks from the request's date on.
 * Earlier days keep the hours they had ({@link KeptDays}).</li>
 * </ul>
 */
@Service
public class ShiftChangeService {

	private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEE, MMM d", Locale.US);

	private final ShiftChangeRepository changes;

	private final ShiftPatternRepository patterns;

	private final ShiftExceptionRepository exceptions;

	private final StudentRepository students;

	private final AdminRepository admins;

	private final SemesterService semesters;

	private final ShiftCalendar calendar;

	private final ApplicationEventPublisher events;

	private final Clock clock;

	private final KeptDays keptDays;

	ShiftChangeService(ShiftChangeRepository changes, ShiftPatternRepository patterns, ShiftExceptionRepository exceptions,
			StudentRepository students, AdminRepository admins, SemesterService semesters, ShiftCalendar calendar,
			ApplicationEventPublisher events, Clock clock, KeptDays keptDays) {
		this.changes = changes;
		this.patterns = patterns;
		this.exceptions = exceptions;
		this.students = students;
		this.admins = admins;
		this.semesters = semesters;
		this.calendar = calendar;
		this.events = events;
		this.clock = clock;
		this.keptDays = keptDays;
	}

	// ---- Students ----

	@Transactional
	public ChangeResponse request(Long studentId, ChangeRequest request) {
		Student student = students.findById(studentId).orElseThrow(() -> new NotFoundException("Student not found."));
		LocalDate date = request.date();
		boolean weekend = date.getDayOfWeek() == DayOfWeek.SATURDAY || date.getDayOfWeek() == DayOfWeek.SUNDAY;
		if (weekend && request.scope() == Scope.EVERY_WEEK) {
			throw new ConflictException("Weekly shifts are Monday to Friday. For one weekend day, choose \"Only on\" that day.");
		}
		if (date.isBefore(LocalDate.now(clock))) {
			throw new ConflictException("That day has already passed.");
		}
		Semester semester = semesters.containing(date)
				.orElseThrow(() -> new ConflictException(date.format(DAY) + " isn't in a semester."));
		List<Block> blocks = request.hours().stream().map(hours -> new Block(hours.start(), hours.end()))
				.sorted((a, b) -> a.start().compareTo(b.start())).toList();
		ShiftRules.check(blocks.stream().map(block -> new TimeBlock(date.getDayOfWeek(), block.start(), block.end())).toList(),
				!weekend, "Shift");
		ShiftChangeRequest saved = changes.save(new ShiftChangeRequest(student, semester, request.scope(), date, blocks,
				request.note(), Instant.now(clock)));
		ActivityLog.about(describe(saved));
		return response(saved);
	}

	@Transactional(readOnly = true)
	public List<ChangeResponse> mine(Long studentId) {
		Student student = students.findById(studentId).orElseThrow(() -> new NotFoundException("Student not found."));
		return changes.findTop50ByStudentOrderBySubmittedAtDesc(student).stream().map(this::response).toList();
	}

	@Transactional
	public ChangeResponse withdraw(Long id, Long studentId) {
		ShiftChangeRequest change = find(id);
		if (!change.getStudent().getId().equals(studentId)) {
			throw new NotFoundException("Request not found.");
		}
		change.withdraw();
		ActivityLog.about(describe(change));
		return response(change);
	}

	// ---- Admins ----

	@Transactional(readOnly = true)
	public List<ChangeResponse> pending() {
		return changes.findByStatusOrderBySubmittedAtAsc(Status.PENDING).stream().map(this::response).toList();
	}

	@Transactional
	public ChangeResponse approve(Long id, Long adminId, String note) {
		ShiftChangeRequest change = find(id);
		change.review(true, admins.getReferenceById(adminId), note, Instant.now(clock));
		Student student = change.getStudent();
		if (change.getScope() == Scope.EVERY_WEEK) {
			keptDays.beforeWeekdayChange(student, change.getSemester(), change.getDay(), change.getDate());
			List<ShiftPattern> sameDay = patterns.findByStudentAndSemesterOrderByDayAscStartAsc(student, change.getSemester())
					.stream().filter(pattern -> pattern.toBlock().day() == change.getDay()).toList();
			patterns.deleteAll(sameDay);
			patterns.flush();
			change.timeBlocks().forEach(block -> patterns.save(new ShiftPattern(student, change.getSemester(), block)));
		}
		else {
			LocalDate date = change.getDate();
			String reason = "Asked for by " + student.getFirstName() + (change.getNote() == null ? "" : ": " + change.getNote());
			ShiftCalendar.Day day = calendar.on(student.getId(), date);
			// The new hours are the whole day: call off the weekly shift, and replace earlier extra shifts.
			exceptions.deleteAll(exceptions.findByStudentAndDateBetweenOrderByDateAsc(student, date, date).stream()
					.filter(existing -> existing.getType() == ShiftExceptionType.EXTRA).toList());
			if (!day.cancelled() && day.shifts().stream().anyMatch(shift -> !shift.extra())) {
				exceptions.save(new ShiftException(student, new ExceptionRequest(date, ShiftExceptionType.CANCEL, null, null, reason),
						admins.getReferenceById(adminId)));
			}
			for (TimeBlock block : change.timeBlocks()) {
				exceptions.save(new ShiftException(student,
						new ExceptionRequest(date, ShiftExceptionType.EXTRA, block.start(), block.end(), reason),
						admins.getReferenceById(adminId)));
			}
			exceptions.flush();
		}
		events.publishEvent(new ShiftsChanged(student.getId()));
		ActivityLog.about(describe(change));
		return response(change);
	}

	@Transactional
	public ChangeResponse decline(Long id, Long adminId, String note) {
		ShiftChangeRequest change = find(id);
		change.review(false, admins.getReferenceById(adminId), note, Instant.now(clock));
		ActivityLog.about(describe(change));
		return response(change);
	}

	@Transactional(readOnly = true)
	public long pendingCount() {
		return changes.countByStatus(Status.PENDING);
	}

	// ---- Helpers ----

	private ShiftChangeRequest find(Long id) {
		return changes.findById(id).orElseThrow(() -> new NotFoundException("Request not found."));
	}

	/** "Sam Lee, Thu Oct 29 only" or "Sam Lee, every Thursday", for the activity log. */
	private static String describe(ShiftChangeRequest change) {
		String who = change.getStudent().getFirstName() + " " + change.getStudent().getLastName();
		return who + ", " + (change.getScope() == Scope.ONE_DAY ? change.getDate().format(DAY) + " only"
				: "every " + change.getDay().getDisplayName(java.time.format.TextStyle.FULL, Locale.US));
	}

	private ChangeResponse response(ShiftChangeRequest change) {
		Student student = change.getStudent();
		List<Hours> current = change.getScope() == Scope.EVERY_WEEK
				? patterns.findByStudentAndSemesterOrderByDayAscStartAsc(student, change.getSemester()).stream()
						.map(ShiftPattern::toBlock).filter(block -> block.day() == change.getDay())
						.map(block -> new Hours(block.start(), block.end())).toList()
				: calendar.on(student.getId(), change.getDate()).shifts().stream()
						.map(shift -> new Hours(shift.start(), shift.end())).toList();
		return new ChangeResponse(change.getId(), student.getId(), student.getFirstName() + " " + student.getLastName(),
				change.getScope(), change.getDate(), change.getDay(),
				change.getBlocks().stream().map(block -> new Hours(block.start(), block.end())).toList(), current,
				change.getNote(), change.getStatus(), change.getSubmittedAt(), change.getReviewedAt(), change.getReviewNote());
	}

}
