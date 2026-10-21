package com.isandt.backend.user;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.isandt.backend.notification.EmailMessage;
import com.isandt.backend.notification.EmailSender;

/**
 * The wording of every account-related email, kept in one place so the services
 * only decide when to send them.
 */
@Component
public class AccountEmails {

	private final EmailSender sender;

	private final String frontendUrl;

	AccountEmails(EmailSender sender, @Value("${app.frontend-url}") String frontendUrl) {
		this.sender = sender;
		this.frontendUrl = frontendUrl;
	}

	/** Sent when an admin adds a student or another admin. */
	public void added(Account account, String token) {
		String portal = account.getRole() == Role.ADMIN ? "IS&T admin portal" : "IS&T portal";
		sender.send(new EmailMessage(account.getEmail(), "You've been added to the " + portal, """
				Hi %s,

				You've been added to the %s. Set your password to get started:
				%s

				This link works once and expires in 48 hours. After setting your password you'll be
				taken to the login page; bookmark it for next time.""".formatted(account.getFirstName(), portal,
				setPasswordLink(token))));
	}

	public void passwordReset(Account account, String token) {
		sender.send(new EmailMessage(account.getEmail(), "Set a new IS&T password", """
				Hi %s,

				Use this link to choose a new password:
				%s

				This link works once and expires in 1 hour. If you didn't ask for this, ignore this email."""
				.formatted(account.getFirstName(), setPasswordLink(token))));
	}

	private String setPasswordLink(String token) {
		return frontendUrl + "/set-password?token=" + URLEncoder.encode(token, StandardCharsets.UTF_8);
	}

}
