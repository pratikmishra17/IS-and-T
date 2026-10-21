package com.isandt.backend.task;

import java.time.Clock;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.isandt.backend.notification.EmailMessage;
import com.isandt.backend.notification.EmailSender;
import com.isandt.backend.user.Student;

/** The wording of task emails to students. */
@Component
class TaskEmails {

	private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("EEEE, MMMM d 'at' h:mm a");

	private final EmailSender sender;

	private final String frontendUrl;

	private final ZoneId zone;

	TaskEmails(EmailSender sender, @Value("${app.frontend-url}") String frontendUrl, Clock clock) {
		this.sender = sender;
		this.frontendUrl = frontendUrl;
		this.zone = clock.getZone();
	}

	void assigned(Student student, Task task) {
		send(student, "New task: " + task.getTitle(), "You've been assigned a " + kind(task) + ".", task);
	}

	void rescheduled(Student student, Task task) {
		send(student, "Task moved: " + task.getTitle(), "This " + kind(task) + " has been rescheduled. The new details:", task);
	}

	void removed(Student student, Task task, String reason) {
		send(student, "Task no longer yours: " + task.getTitle(), "This " + kind(task) + " is no longer assigned to you ("
				+ reason + ").", task);
	}

	void cancelled(Student student, Task task) {
		send(student, "Task cancelled: " + task.getTitle(), "This " + kind(task) + " has been cancelled. Nothing to do.", task);
	}

	void available(List<Student> students, Task task) {
		for (Student student : students) {
			send(student, "Task needs someone: " + task.getTitle(), "Nobody is assigned to this " + kind(task)
					+ " yet. If you can take it, claim it on your Tasks page.", task);
		}
	}

	private void send(Student student, String subject, String intro, Task task) {
		sender.send(new EmailMessage(student.getEmail(), subject, """
				Hi %s,

				%s

				  %s
				  When:     %s (%d min)
				  Where:    %s %s
				  Employee: %s%s%s

				See your tasks: %s/tasks""".formatted(student.getFirstName(), intro, task.getTitle(),
				task.getStartAt().atZone(zone).format(WHEN), task.getDurationMinutes(), task.getBuilding(), task.getRoom(),
				task.getEmployeeName(), task.getEmployeeEmail() == null ? "" : ", " + task.getEmployeeEmail(),
				task.getEmployeePhone() == null ? "" : ", " + task.getEmployeePhone(), frontendUrl)));
	}

	private static String kind(Task task) {
		return task.getType() == TaskType.DEPLOYMENT ? "deployment" : "fix";
	}

}
