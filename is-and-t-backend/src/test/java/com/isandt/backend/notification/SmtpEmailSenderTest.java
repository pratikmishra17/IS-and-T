package com.isandt.backend.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.javamail.JavaMailSender;

import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;

class SmtpEmailSenderTest {

	private final JavaMailSender mailSender = mock(JavaMailSender.class);

	@Test
	void everyEmailComesFromTheConfiguredAddress() throws Exception {
		when(mailSender.createMimeMessage()).thenReturn(new MimeMessage((Session) null));
		EmailSender sender = new SmtpEmailSender(mailSender, "gomesalister98@gmail.com", "IS&T Portal");

		sender.send(new EmailMessage("sam@example.com", "You've been added", "Hi Sam"));

		ArgumentCaptor<MimeMessage> sent = ArgumentCaptor.forClass(MimeMessage.class);
		verify(mailSender).send(sent.capture());
		InternetAddress from = (InternetAddress) sent.getValue().getFrom()[0];
		assertThat(from.getAddress()).isEqualTo("gomesalister98@gmail.com");
		assertThat(from.getPersonal()).isEqualTo("IS&T Portal");
		assertThat(sent.getValue().getAllRecipients()[0]).hasToString("sam@example.com");
		assertThat(sent.getValue().getSubject()).isEqualTo("You've been added");
	}

	@Test
	void withoutAnAppPasswordEmailsGoToTheConsole() {
		@SuppressWarnings("unchecked")
		ObjectProvider<JavaMailSender> provider = mock(ObjectProvider.class);
		when(provider.getIfAvailable()).thenReturn(mailSender);

		EmailSender sender = new EmailConfig().emailSender(provider, "", "gomesalister98@gmail.com", "IS&T Portal");

		assertThat(sender).isInstanceOf(ConsoleEmailSender.class);
	}

	@Test
	void withAnAppPasswordEmailsAreReallySent() {
		@SuppressWarnings("unchecked")
		ObjectProvider<JavaMailSender> provider = mock(ObjectProvider.class);
		when(provider.getIfAvailable()).thenReturn(mailSender);

		EmailSender sender = new EmailConfig().emailSender(provider, "app-password", "gomesalister98@gmail.com",
				"IS&T Portal");

		assertThat(sender).isInstanceOf(SmtpEmailSender.class);
	}

}
