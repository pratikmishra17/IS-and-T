package com.isandt.backend.timeoff;

import java.time.format.DateTimeFormatter;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.isandt.backend.notification.EmailMessage;
import com.isandt.backend.notification.EmailSender;
import com.isandt.backend.user.Admin;

/** The wording of time-off emails. */
@Component
class TimeOffEmails {

	private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEEE, MMMM d");

	private final EmailSender sender;

	private final String frontendUrl;

	TimeOffEmails(EmailSender sender, @Value("${app.frontend-url}") String frontendUrl) {
		this.sender = sender;
		this.frontendUrl = frontendUrl;
	}

	void requested(TimeOffRequest request, List<Admin> admins) {
		String who = request.getStudent().getFirstName() + " " + request.getStudent().getLastName();
		for (Admin admin : admins) {
			sender.send(new EmailMessage(admin.getEmail(), "Time off request: " + who, """
					%s asked for time off: %s%s.

					Review it here: %s/admin/schedules""".formatted(who, describe(request),
					request.getReason() == null ? "" : " (" + request.getReason() + ")", frontendUrl)));
		}
	}

	void reviewed(TimeOffRequest request) {
		boolean approved = request.getStatus() == TimeOffStatus.APPROVED;
		sender.send(new EmailMessage(request.getStudent().getEmail(), "Time off " + (approved ? "approved" : "declined"), """
				Hi %s,

				Your request for time off (%s) was %s.%s

				See your schedule: %s/schedule""".formatted(request.getStudent().getFirstName(), describe(request),
				approved ? "approved; any tasks in that time have been moved off you" : "declined",
				request.getReviewNote() == null ? "" : "\nNote: " + request.getReviewNote(), frontendUrl)));
	}

	static String describe(TimeOffRequest request) {
		return request.getDate().format(DAY)
				+ (request.wholeDay() ? ", the whole day" : ", " + request.getStart() + "–" + request.getEnd());
	}

}
