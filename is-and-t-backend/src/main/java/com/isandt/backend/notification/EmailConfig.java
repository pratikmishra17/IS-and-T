package com.isandt.backend.notification;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.mail.javamail.JavaMailSender;

/**
 * Decides at startup which EmailSender the whole app uses. Services only know the EmailSender
 * interface, so this is the one place that changes when the way email is sent changes.
 */
@Configuration
class EmailConfig {

	private static final Logger log = LoggerFactory.getLogger(EmailConfig.class);

	/**
	 * Real emails when a Gmail App Password is set (GMAIL_APP_PASSWORD), otherwise the console.
	 * The fallback lets anyone run the app without the sending account's credentials.
	 */
	@Bean
	EmailSender emailSender(ObjectProvider<JavaMailSender> mailSender, @Value("${spring.mail.password:}") String password,
			@Value("${app.mail.from}") String fromAddress, @Value("${app.mail.from-name}") String fromName) {
		JavaMailSender smtp = mailSender.getIfAvailable();
		if (smtp == null || password.isBlank()) {
			log.warn("GMAIL_APP_PASSWORD is not set: emails will be printed to the console, not sent.");
			return new ConsoleEmailSender();
		}
		log.info("Emails will be sent from {} <{}>.", fromName, fromAddress);
		return new SmtpEmailSender(smtp, fromAddress, fromName);
	}

}
