package com.isandt.backend.schedule;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.isandt.backend.calendar.Semester;
import com.isandt.backend.notification.EmailMessage;
import com.isandt.backend.notification.EmailSender;
import com.isandt.backend.user.Admin;
import com.isandt.backend.user.Student;

/** The wording of schedule emails. */
@Component
class ScheduleEmails {

	private final EmailSender sender;

	private final String frontendUrl;

	ScheduleEmails(EmailSender sender, @Value("${app.frontend-url}") String frontendUrl) {
		this.sender = sender;
		this.frontendUrl = frontendUrl;
	}

	void submitted(Student student, Semester semester, List<Admin> admins) {
		for (Admin admin : admins) {
			sender.send(new EmailMessage(admin.getEmail(), "Hours to approve: " + student.getFirstName() + " "
					+ student.getLastName(), """
					%s %s has submitted the hours they'd like to work in %s.

					Review them here: %s/admin/schedules""".formatted(student.getFirstName(), student.getLastName(),
					semester.getName(), frontendUrl)));
		}
	}

	void approved(Student student, Semester semester, List<TimeBlock> shifts, boolean changed) {
		String list = shifts.isEmpty() ? "  (no shifts)"
				: shifts.stream().map(block -> "  " + block.describe()).collect(Collectors.joining("\n"));
		sender.send(new EmailMessage(student.getEmail(), "Your " + semester.getName() + " shifts", """
				Hi %s,

				Your hours for %s have been approved%s. Your weekly shifts:
				%s

				See your schedule: %s/schedule""".formatted(student.getFirstName(), semester.getName(),
				changed ? " with some changes" : "", list, frontendUrl)));
	}

}
