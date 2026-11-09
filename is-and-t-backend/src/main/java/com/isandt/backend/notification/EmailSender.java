package com.isandt.backend.notification;

/**
 * Sends an email. Services depend on this interface, not on a specific implementation,
 * so switching from the console to real SMTP later doesn't touch any business code.
 */
public interface EmailSender {

	void send(EmailMessage message);

}
