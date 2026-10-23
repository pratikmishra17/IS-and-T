package com.isandt.backend.portal;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Base64;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.isandt.backend.common.error.NotFoundException;
import com.isandt.backend.schedule.ShiftCalendar;
import com.isandt.backend.task.StudentTaskService;
import com.isandt.backend.task.TaskResponses.TaskResponse;
import com.isandt.backend.task.TaskStatus;
import com.isandt.backend.task.TaskText;
import com.isandt.backend.user.Student;
import com.isandt.backend.user.StudentRepository;

/**
 * Each student's private calendar feed: their shifts and tasks from two weeks ago to eight weeks
 * ahead, which Google/Apple Calendar re-fetch regularly, so changes show up on their phone.
 */
@Service
public class CalendarFeedService {

	/** The link a student copies into their calendar app. */
	public record FeedLink(String url, String webcalUrl) {
	}

	private final StudentRepository students;

	private final ShiftCalendar shifts;

	private final StudentTaskService tasks;

	private final String frontendUrl;

	private final Clock clock;

	private final ZoneId zone;

	private final SecureRandom random = new SecureRandom();

	CalendarFeedService(StudentRepository students, ShiftCalendar shifts, StudentTaskService tasks,
			@Value("${app.frontend-url}") String frontendUrl, Clock clock) {
		this.students = students;
		this.shifts = shifts;
		this.tasks = tasks;
		this.frontendUrl = frontendUrl;
		this.clock = clock;
		this.zone = clock.getZone();
	}

	/** The student's link, created the first time they ask. */
	@Transactional
	public FeedLink link(Long studentId) {
		Student student = student(studentId);
		if (student.getCalendarToken() == null) {
			student.changeCalendarToken(newToken());
		}
		return linkFor(student);
	}

	/** A new link; the old one stops working (for example if it was shared by mistake). */
	@Transactional
	public FeedLink regenerate(Long studentId) {
		Student student = student(studentId);
		student.changeCalendarToken(newToken());
		return linkFor(student);
	}

	/** The .ics file for a token. An unknown token gets "not found", revealing nothing. */
	@Transactional(readOnly = true)
	public String feed(String token) {
		Student student = students.findByCalendarToken(token).orElseThrow(() -> new NotFoundException("Calendar not found."));
		LocalDate from = LocalDate.now(clock).minusWeeks(2);
		LocalDate to = LocalDate.now(clock).plusWeeks(8);
		IcsWriter ics = new IcsWriter("IS&T: " + student.getFirstName() + "'s shifts and tasks");

		Map<LocalDate, ShiftCalendar.Day> days = shifts.between(List.of(student.getId()), from, to).get(student.getId());
		days.forEach((date, day) -> day.shifts().forEach(shift -> ics.event(
				"shift-" + student.getId() + "-" + date + "-" + shift.start() + "@isandt",
				date.atTime(shift.start()).atZone(zone).toInstant(), date.atTime(shift.end()).atZone(zone).toInstant(),
				shift.extra() ? "IS&T extra shift" : "IS&T shift", null, null)));

		for (TaskResponse task : tasks.tasksBetween(student.getId(), from, to)) {
			if (task.status() == TaskStatus.ASSIGNED || task.status() == TaskStatus.COMPLETED) {
				ics.event("task-" + task.id() + "@isandt",
						task.date().atTime(task.startTime()).atZone(zone).toInstant(),
						task.date().atTime(task.endTime()).atZone(zone).toInstant(),
						(task.status() == TaskStatus.COMPLETED ? "✓ " : "") + task.title(),
						task.location(), details(task));
			}
		}
		return ics.finish();
	}

	private FeedLink linkFor(Student student) {
		String url = frontendUrl + "/api/calendar/" + student.getCalendarToken() + ".ics";
		return new FeedLink(url, url.replaceFirst("^https?://", "webcal://"));
	}

	private String newToken() {
		byte[] bytes = new byte[24];
		random.nextBytes(bytes);
		return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
	}

	private Student student(Long id) {
		return students.findById(id).orElseThrow(() -> new NotFoundException("Student not found."));
	}

	/** The event's notes: the employee, what to bring, the description, and a link to the task. */
	private String details(TaskResponse task) {
		String employee = TaskText.employee(task.employee().name(), task.employee().email(), task.employee().phone());
		String bring = TaskText.supplies(task.supplies());
		StringBuilder text = new StringBuilder();
		if (employee != null) {
			text.append("Employee: ").append(employee).append('\n');
		}
		if (bring != null) {
			text.append("Bring: ").append(bring).append('\n');
		}
		if (task.description() != null) {
			text.append(task.description()).append('\n');
		}
		return text.append(frontendUrl).append("/tasks").toString();
	}

}
