package com.isandt.backend.timeoff;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.isandt.backend.common.error.ConflictException;
import com.isandt.backend.common.error.NotFoundException;
import com.isandt.backend.common.web.Saved;
import com.isandt.backend.schedule.AdminScheduleService;
import com.isandt.backend.schedule.ExceptionRequest;
import com.isandt.backend.schedule.ShiftCalendar;
import com.isandt.backend.schedule.ShiftExceptionType;
import com.isandt.backend.task.AdminTaskService;
import com.isandt.backend.task.StudentTaskService;
import com.isandt.backend.task.TaskResponses.TaskResponse;
import com.isandt.backend.task.TaskStatus;
import com.isandt.backend.user.Admin;
import com.isandt.backend.user.AdminRepository;
import com.isandt.backend.user.Student;
import com.isandt.backend.user.StudentRepository;

/**
 * Time-off requests: a student asks, an admin approves or declines. Approving turns the request into
 * a schedule change (a day off, or time off for part of a day). That publishes ShiftsChanged, so the
 * task package moves the student's tasks in that time to someone free and on shift; afterwards this
 * service reports what happened to each task, so the admin knows about any that nobody could take.
 */
@Service
public class TimeOffService {

	private final TimeOffRepository requests;

	private final StudentRepository students;

	private final AdminRepository admins;

	private final ShiftCalendar shifts;

	private final AdminScheduleService schedule;

	private final StudentTaskService studentTasks;

	private final AdminTaskService adminTasks;

	private final TimeOffEmails emails;

	private final Clock clock;

	TimeOffService(TimeOffRepository requests, StudentRepository students, AdminRepository admins, ShiftCalendar shifts,
			AdminScheduleService schedule, StudentTaskService studentTasks, AdminTaskService adminTasks,
			TimeOffEmails emails, Clock clock) {
		this.requests = requests;
		this.students = students;
		this.admins = admins;
		this.shifts = shifts;
		this.schedule = schedule;
		this.studentTasks = studentTasks;
		this.adminTasks = adminTasks;
		this.emails = emails;
		this.clock = clock;
	}

	// ---- Student ----

	@Transactional
	public TimeOffResponse request(Long studentId, TimeOffBody body) {
		Student student = student(studentId);
		LocalDate date = body.date();
		if (date.isBefore(LocalDate.now(clock))) {
			throw new ConflictException("Time off can't be in the past.");
		}
		if (date.getDayOfWeek() == DayOfWeek.SATURDAY || date.getDayOfWeek() == DayOfWeek.SUNDAY) {
			throw new ConflictException("There are no shifts at weekends.");
		}
		if ((body.start() == null) != (body.end() == null)) {
			throw new ConflictException("Give both a start and an end time, or neither for the whole day.");
		}
		if (body.start() != null && !body.end().isAfter(body.start())) {
			throw new ConflictException("The end time must be after the start time.");
		}
		ShiftCalendar.Day day = shifts.on(studentId, date);
		boolean working = day.shifts().stream().anyMatch(shift -> body.start() == null
				|| (shift.start().isBefore(body.end()) && body.start().isBefore(shift.end())));
		if (!working) {
			throw new ConflictException("You aren't working " + (body.start() == null ? "that day" : "then") + ", so there's nothing to take off.");
		}
		TimeOffRequest saved = requests.save(new TimeOffRequest(student, body));
		emails.requested(saved, admins.findAllByOrderByLastNameAscFirstNameAsc().stream().filter(Admin::isActive).toList());
		return describe(saved);
	}

	/** The student's requests from 30 days ago on, newest date first. */
	@Transactional(readOnly = true)
	public List<TimeOffResponse> mine(Long studentId) {
		return requests.findByStudentAndDateGreaterThanEqualOrderByDateDesc(student(studentId), LocalDate.now(clock).minusDays(30))
				.stream().map(this::describe).toList();
	}

	@Transactional
	public TimeOffResponse withdraw(Long id, Long studentId) {
		TimeOffRequest request = find(id);
		if (!request.getStudent().getId().equals(studentId)) {
			throw new NotFoundException("Request not found.");
		}
		request.withdraw();
		return describe(request);
	}

	// ---- Admin ----

	@Transactional(readOnly = true)
	public List<TimeOffResponse> pending() {
		return requests.findByStatusWithStudent(TimeOffStatus.PENDING).stream().map(this::describe).toList();
	}

	@Transactional(readOnly = true)
	public long pendingCount() {
		return requests.countByStatus(TimeOffStatus.PENDING);
	}

	/**
	 * Approves: adds the day off / time off to the schedule, which reassigns affected tasks, then reports
	 * where each one went. Tasks nobody could take stay unassigned and come back as warnings.
	 */
	@Transactional
	public Saved<TimeOffResponse> approve(Long id, Long adminId, ReviewBody body) {
		TimeOffRequest request = find(id);
		Long studentId = request.getStudent().getId();
		List<TaskResponse> affected = affectedTasks(request);

		ShiftCalendar.Day day = shifts.on(studentId, request.getDate());
		List<String> notes = new ArrayList<>();
		if (request.wholeDay() && day.cancelled()) {
			notes.add("They already had that day off.");
		}
		else {
			ShiftExceptionType type = request.wholeDay() ? ShiftExceptionType.CANCEL : ShiftExceptionType.OFF;
			schedule.addException(studentId, new ExceptionRequest(request.getDate(), type, request.getStart(),
					request.getEnd(), "Time off" + (request.getReason() == null ? "" : ": " + request.getReason())), adminId);
		}
		request.approve(admins.getReferenceById(adminId), body == null ? null : body.note());
		emails.reviewed(request);

		Map<Long, TaskResponse> after = adminTasks.list(request.getDate(), request.getDate(), null).stream()
				.collect(Collectors.toMap(TaskResponse::id, Function.identity()));
		for (TaskResponse before : affected) {
			TaskResponse now = after.get(before.id());
			if (now == null) {
				continue;
			}
			if (now.status() == TaskStatus.UNASSIGNED) {
				notes.add("“" + now.title() + "” at " + now.startTime() + " couldn't be given to anyone: nobody else is on shift and free then. "
						+ "It's unassigned now; assign it on the Tasks page.");
			}
			else if (now.assignee() != null && !now.assignee().id().equals(studentId)) {
				notes.add("“" + now.title() + "” at " + now.startTime() + " went to " + now.assignee().name() + ".");
			}
		}
		return new Saved<>(describe(request), notes);
	}

	@Transactional
	public TimeOffResponse decline(Long id, Long adminId, ReviewBody body) {
		TimeOffRequest request = find(id);
		request.decline(admins.getReferenceById(adminId), body == null ? null : body.note());
		emails.reviewed(request);
		return describe(request);
	}

	// ---- Helpers ----

	/** The student's assigned tasks that overlap the requested time. */
	private List<TaskResponse> affectedTasks(TimeOffRequest request) {
		LocalTime from = request.wholeDay() ? LocalTime.MIN : request.getStart();
		LocalTime to = request.wholeDay() ? LocalTime.MAX : request.getEnd();
		return studentTasks.tasksBetween(request.getStudent().getId(), request.getDate(), request.getDate()).stream()
				.filter(task -> task.status() == TaskStatus.ASSIGNED)
				.filter(task -> task.startTime().isBefore(to) && from.isBefore(task.endTime()))
				.toList();
	}

	private TimeOffResponse describe(TimeOffRequest request) {
		Student student = request.getStudent();
		List<TaskResponse> affected = request.getStatus() == TimeOffStatus.PENDING ? affectedTasks(request) : List.of();
		return new TimeOffResponse(request.getId(), student.getId(), student.getFirstName() + " " + student.getLastName(),
				request.getDate(), request.getStart(), request.getEnd(), request.getReason(), request.getStatus(),
				request.getSubmittedAt(), request.getReviewedAt(), request.getReviewNote(), affected);
	}

	private TimeOffRequest find(Long id) {
		return requests.findById(id).orElseThrow(() -> new NotFoundException("Request not found."));
	}

	private Student student(Long id) {
		return students.findById(id).orElseThrow(() -> new NotFoundException("Student not found."));
	}

}
