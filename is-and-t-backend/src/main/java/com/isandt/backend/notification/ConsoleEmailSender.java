package com.isandt.backend.notification;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Writes emails to the console instead of sending them. Used when no email account is configured
 * (see EmailConfig).
 */
public class ConsoleEmailSender implements EmailSender {

	private static final Logger log = LoggerFactory.getLogger(ConsoleEmailSender.class);

	@Override
	public void send(EmailMessage message) {
		log.info("""

				----- Email (console only, not sent) -----
				To:      {}
				Subject: {}

				{}
				------------------------------------------""", message.to(), message.subject(), message.body());
	}

}
