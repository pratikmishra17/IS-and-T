package com.isandt.backend.notification;

import java.io.UnsupportedEncodingException;

import org.springframework.mail.MailPreparationException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;

/**
 * Sends real emails through an SMTP server (Gmail, configured by the spring.mail.* settings).
 * Every email comes from the same address, whichever admin's action triggered it.
 */
public class SmtpEmailSender implements EmailSender {

	private final JavaMailSender mailSender;

	private final String fromAddress;

	private final String fromName;

	SmtpEmailSender(JavaMailSender mailSender, String fromAddress, String fromName) {
		this.mailSender = mailSender;
		this.fromAddress = fromAddress;
		this.fromName = fromName;
	}

	/** Throws a MailException if the server can't be reached or refuses the email. */
	@Override
	public void send(EmailMessage message) {
		MimeMessage mime = mailSender.createMimeMessage();
		try {
			MimeMessageHelper helper = new MimeMessageHelper(mime, "UTF-8");
			// Shown in the inbox as: IS&T Portal <gomesalister98@gmail.com>
			helper.setFrom(fromAddress, fromName);
			helper.setTo(message.to());
			helper.setSubject(message.subject());
			helper.setText(message.body());
		}
		catch (MessagingException | UnsupportedEncodingException ex) {
			throw new MailPreparationException("Could not build the email to " + message.to(), ex);
		}
		mailSender.send(mime);
	}

}
