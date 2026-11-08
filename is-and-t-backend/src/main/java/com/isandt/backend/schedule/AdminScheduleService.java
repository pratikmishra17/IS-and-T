package com.isandt.backend.schedule;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.isandt.backend.activity.ActivityLog;
import com.isandt.backend.calendar.HolidayService;
import com.isandt.backend.calendar.Semester;
import com.isandt.backend.calendar.SemesterService;
import com.isandt.backend.common.error.ConflictException;
import com.isandt.backend.common.error.NotFoundException;
import com.isandt.backend.schedule.ScheduleResponses.ExceptionInfo;
import com.isandt.backend.schedule.ScheduleResponses.PendingRequest;
import com.isandt.backend.schedule.ScheduleResponses.SemesterUsage;
import com.isandt.backend.common.web.Saved;
import com.isandt.backend.schedule.ScheduleResponses.StudentDay;
import com.isandt.backend.schedule.ScheduleResponses.StudentSchedule;
import com.isandt.backend.schedule.ScheduleResponses.StudentWeek;
import com.isandt.backend.schedule.ScheduleResponses.Week;
import com.isandt.backend.schedule.ScheduleResponses.WeekDay;
import com.isandt.backend.schedule.ScheduleResponses.WeekShift;
import com.isandt.backend.user.AdminRepository;
import com.isandt.backend.user.Student;
import com.isandt.backend.user.StudentRepository;

/**
 * The admin side: reviewing requests, setting weekly shifts, one-off changes, and the team week.
 * Hard rules (overlaps, weekly shifts at weekends) block saving; soft rules (hour limit, classes, holidays) come
 * back as warnings next to what was saved.
 */
@Service
public class AdminScheduleService {

	private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEE, MMM d", java.util.Locale.US);

	private final StudentRepository students;

	private final AdminRepository admins;

	private final SemesterService semesters;

	private final HolidayService holidays;

	private final ShiftPatternRepository patterns;

	private final ShiftExceptionRepository exceptions;

	private final ScheduleRequestRepository requests;

	private final StudentSchedules schedules;

	private final ShiftCalendar calendar;

	private final ScheduleEmails emails;

	private final Clock clock;

	private final ApplicationEventPublisher events;

	private final KeptDays keptDays;

	private final AvailabilityBlockRepository availability;

	private final ShiftChangeRepository shiftChanges;

	AdminScheduleService(StudentRepository students, AdminRepository admins, SemesterService semesters,
			HolidayService holidays, ShiftPatternRepository patterns, ShiftExceptionRepository exceptions,
			ScheduleRequestRepository requests, StudentSchedules schedules, ShiftCalendar calendar,
			ScheduleEmails emails, Clock clock, ApplicationEventPublisher events, KeptDays keptDays,
			AvailabilityBlockRepository availability, ShiftChangeRepository shiftChanges) {
		this.students = students;
		this.admins = admins;
		this.semesters = semesters;
		this.holidays = holidays;
		this.patterns = patterns;
		this.exceptions = exceptions;
		this.requests = requests;
		this.schedules = schedules;
		this.calendar = calendar;
		this.emails = emails;
		this.clock = clock;
		this.events = events;
		this.keptDays = keptDays;
		this.availability = availability;
		this.shiftChanges = shiftChanges;
	}

	@Transactional(readOnly = true)
	public List<PendingRequest> pendingRequests() {
		return requests.findByStatusWithDetails(ScheduleRequestStatus.SUBMITTED).stream()
				.map(request -> new PendingRequest(request.getId(), request.getStudent().getId(),
						request.getStudent().getFirstName() + " " + request.getStudent().getLastName(),
						request.getSemester().getId(), request.getSemester().getName(), request.getSubmittedAt()))
				.toList();
	}

	@Transactional(readOnly = true)
	public StudentSchedule studentSchedule(Long studentId, Long semesterId) {
		return schedules.describe(student(studentId), semesters.find(semesterId));
	}

	/** What deleting this semester would delete with it, for the confirmation. */
	@Transactional(readOnly = true)
	public SemesterUsage semesterUsage(Long semesterId) {
		Semester semester = semesters.find(semesterId);
		List<ShiftPattern> weekly = patterns.findBySemesterIn(List.of(semester));
		return new SemesterUsage(weekly.stream().map(ShiftPattern::studentId).distinct().count(), weekly.size(),
				availability.countStudentsBySemester(semester), requests.countBySemester(semester), shiftChanges.countBySemester(semester));
	}

	/** Replaces the student's weekly shifts; with a requestId, also approves that request. */
	@Transactional
	public Saved<StudentSchedule> setShifts(Long studentId, Long semesterId, ShiftsRequest request, Long adminId) {
		Student student = student(studentId);
		Semester semester = semesters.find(semesterId);
		ShiftRules.check(request.shifts(), true, "Shift");

		keptDays.beforeNewWeek(student, semester); // past days keep the shifts they had
		patterns.deleteByStudentAndSemester(student, semester);
		patterns.flush();
		request.shifts().forEach(block -> patterns.save(new ShiftPattern(student, semester, block)));
		patterns.flush();

		if (request.requestId() != null) {
			ScheduleRequest pending = requests.findById(request.requestId())
					.filter(found -> found.getStudent().getId().equals(studentId) && found.getSemester().getId().equals(semesterId))
					.orElseThrow(() -> new NotFoundException("Request not found."));
			if (pending.getStatus() != ScheduleRequestStatus.SUBMITTED) {
				throw new ConflictException("This request has already been approved.");
			}
			List<TimeBlock> preferred = schedules.describe(student, semester).preferred();
			boolean changed = !sameBlocks(preferred, request.shifts());
			pending.approve(admins.getReferenceById(adminId), changed);
			emails.approved(student, semester, request.shifts(), changed);
		}
		events.publishEvent(new ShiftsChanged(studentId));
		return new Saved<>(schedules.describe(student, semester), weeklyWarnings(student, semester, request.shifts()));
	}

	/** A day off or an extra shift on one date. */
	@Transactional
	public Saved<ExceptionInfo> addException(Long studentId, ExceptionRequest request, Long adminId) {
		Student student = student(studentId);
		LocalDate date = request.date();
		ActivityLog.about(student.getFirstName() + " " + student.getLastName() + ", " + date.format(DAY));
		boolean weekend = date.getDayOfWeek() == DayOfWeek.SATURDAY || date.getDayOfWeek() == DayOfWeek.SUNDAY;
		if (weekend && request.type() == ShiftExceptionType.CANCEL) {
			throw new ConflictException("Weekends have no weekly shifts to call off. To undo an extra weekend shift, delete it.");
		}
		if (request.type() == ShiftExceptionType.CANCEL && (request.start() != null || request.end() != null)) {
			throw new ConflictException("A whole day off doesn't have times. For part of the day, choose \"Time off (hours)\".");
		}
		ShiftCalendar.Day day = calendar.on(studentId, date);
		List<String> warnings = new ArrayList<>();

		if (request.type() == ShiftExceptionType.CANCEL) {
			if (day.cancelled()) {
				throw new ConflictException(student.getFirstName() + " already has " + date.format(DAY) + " off.");
			}
			if (day.shifts().stream().noneMatch(shift -> !shift.extra())) {
				warnings.add(student.getFirstName() + " had no weekly shift on " + date.format(DAY) + " anyway.");
			}
		}
		else if (request.type() == ShiftExceptionType.OFF) {
			if (request.start() == null || request.end() == null || !request.end().isAfter(request.start())) {
				throw new ConflictException("Time off needs a start and an end, and the end must be after the start.");
			}
			TimeBlock off = new TimeBlock(date.getDayOfWeek(), request.start(), request.end());
			if (day.shifts().stream().noneMatch(shift -> off.overlaps(new TimeBlock(date.getDayOfWeek(), shift.start(), shift.end())))) {
				throw new ConflictException(student.getFirstName() + " isn't working then on " + date.format(DAY) + ".");
			}
		}
		else {
			if (request.start() == null || request.end() == null || !request.end().isAfter(request.start())) {
				throw new ConflictException("An extra shift needs a start and an end, and the end must be after the start.");
			}
			TimeBlock extra = new TimeBlock(date.getDayOfWeek(), request.start(), request.end());
			day.shifts().stream()
				.filter(shift -> extra.overlaps(new TimeBlock(date.getDayOfWeek(), shift.start(), shift.end())))
				.findFirst()
				.ifPresent(shift -> {
					throw new ConflictException(student.getFirstName() + " already works " + shift.start() + "–" + shift.end()
							+ " that day.");
				});
			warnings.addAll(extraShiftWarnings(student, date, extra));
		}
		ShiftException saved = exceptions.save(new ShiftException(student, request, admins.getReferenceById(adminId)));
		exceptions.flush();
		events.publishEvent(new ShiftsChanged(studentId));
		return new Saved<>(ExceptionInfo.from(saved), warnings);
	}

	@Transactional
	public void deleteException(Long id) {
		ShiftException exception = exceptions.findById(id).orElseThrow(() -> new NotFoundException("Change not found."));
		ActivityLog.about(exception.describe());
		exceptions.delete(exception);
		exceptions.flush();
		events.publishEvent(new ShiftsChanged(exception.studentId()));
	}

	/** Monday to Sunday of the week containing the given date (this week if null), for every active student. */
	@Transactional(readOnly = true)
	public Week week(LocalDate anyDay) {
		if (anyDay == null) {
			anyDay = LocalDate.now(clock);
		}
		LocalDate monday = anyDay.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
		LocalDate friday = monday.plusDays(6); // the whole week: weekends only have extra shifts, but they can
		List<Student> team = students.findAllByOrderByLastNameAscFirstNameAsc().stream().filter(Student::isActive).toList();
		Map<Long, Map<LocalDate, ShiftCalendar.Day>> shifts = calendar.between(team.stream().map(Student::getId).toList(),
				monday, friday);
		Map<LocalDate, String> holidayNames = holidays.namesBetween(monday, friday);
		Optional<Semester> semester = monday.datesUntil(friday.plusDays(1))
				.map(semesters::containing).flatMap(Optional::stream).findFirst();
		Integer limit = semester.map(Semester::getWeeklyHourLimit).orElse(null);

		List<WeekDay> days = monday.datesUntil(friday.plusDays(1)).map(date -> new WeekDay(date, holidayNames.get(date))).toList();
		List<StudentWeek> rows = team.stream().map(student -> {
			List<StudentDay> studentDays = days.stream().map(weekDay -> {
				ShiftCalendar.Day day = shifts.get(student.getId()).get(weekDay.date());
				return new StudentDay(weekDay.date(),
						day.shifts().stream().map(s -> new WeekShift(s.start(), s.end(), s.extra())).toList(), day.cancelled(),
						day.timeOff().stream().map(w -> new WeekShift(w.start(), w.end(), false)).toList());
			}).toList();
			double hours = studentDays.stream().flatMap(d -> d.shifts().stream())
					.mapToLong(s -> Duration.between(s.start(), s.end()).toMinutes()).sum() / 60.0;
			return new StudentWeek(student.getId(), student.getFirstName() + " " + student.getLastName(), studentDays, hours,
					limit != null && hours > limit);
		}).toList();
		return new Week(monday, days, rows, limit, semester.map(Semester::getName).orElse(null));
	}

	// ---- Warnings: things worth knowing that don't stop saving ----

	private List<String> weeklyWarnings(Student student, Semester semester, List<TimeBlock> shifts) {
		List<String> warnings = new ArrayList<>();
		double hours = ShiftRules.hours(shifts);
		if (hours > semester.getWeeklyHourLimit()) {
			warnings.add(student.getFirstName() + " is scheduled " + ShiftRules.formatHours(hours) + " h a week; the "
					+ semester.getName() + " limit is " + semester.getWeeklyHourLimit() + " h.");
		}
		List<TimeBlock> classes = schedules.classes(student, semester);
		for (TimeBlock shift : shifts) {
			classes.stream().filter(shift::overlaps).findFirst().ifPresent(
					cls -> warnings.add(shift.describe() + " overlaps " + student.getFirstName() + "'s class (" + cls.describe() + ")."));
		}
		List<Map.Entry<LocalDate, String>> onShiftDays = holidays.namesBetween(semester.getStartDate(), semester.getEndDate())
				.entrySet().stream()
				.filter(holiday -> shifts.stream().anyMatch(shift -> shift.day() == holiday.getKey().getDayOfWeek()))
				.toList();
		if (!onShiftDays.isEmpty()) {
			Map.Entry<LocalDate, String> first = onShiftDays.getFirst();
			warnings.add(onShiftDays.size() + " holiday" + (onShiftDays.size() == 1 ? " falls" : "s fall")
					+ " on scheduled days (first: " + first.getValue() + ", " + first.getKey().format(DAY)
					+ "). Weekly shifts don't apply on holidays; add an extra shift if someone should work.");
		}
		return warnings;
	}

	private List<String> extraShiftWarnings(Student student, LocalDate date, TimeBlock extra) {
		List<String> warnings = new ArrayList<>();
		String holiday = holidays.namesBetween(date, date).get(date);
		if (holiday != null) {
			warnings.add(date.format(DAY) + " is a holiday (" + holiday + "): weekly shifts are off, but this extra shift still counts.");
		}
		Optional<Semester> semester = semesters.containing(date);
		semester.ifPresent(s -> schedules.classes(student, s).stream().filter(extra::overlaps).findFirst()
				.ifPresent(cls -> warnings.add("This overlaps " + student.getFirstName() + "'s class (" + cls.describe() + ").")));
		semester.ifPresent(s -> {
			LocalDate monday = date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
			double hours = calendar.between(List.of(student.getId()), monday, monday.plusDays(6)).get(student.getId()).values()
					.stream().flatMap(day -> day.shifts().stream())
					.mapToLong(shift -> Duration.between(shift.start(), shift.end()).toMinutes()).sum() / 60.0
					+ extra.minutes() / 60.0;
			if (hours > s.getWeeklyHourLimit()) {
				warnings.add("That week " + student.getFirstName() + " will work " + ShiftRules.formatHours(hours)
						+ " h; the limit is " + s.getWeeklyHourLimit() + " h.");
			}
		});
		return warnings;
	}

	private static boolean sameBlocks(List<TimeBlock> a, List<TimeBlock> b) {
		return a.size() == b.size() && a.containsAll(b);
	}

	private Student student(Long id) {
		return students.findById(id).orElseThrow(() -> new NotFoundException("Student " + id + " not found."));
	}

}
