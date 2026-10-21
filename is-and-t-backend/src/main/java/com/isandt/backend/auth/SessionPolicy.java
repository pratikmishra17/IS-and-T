package com.isandt.backend.auth;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.isandt.backend.user.Role;

/** How long a login lasts: an idle timeout per role, and a maximum length however active you are. */
@Component
public class SessionPolicy {

	private final Duration adminIdle;

	private final Duration studentIdle;

	private final Duration maxLength;

	SessionPolicy(@Value("${app.session.admin-idle-minutes}") int adminIdleMinutes,
			@Value("${app.session.student-idle-minutes}") int studentIdleMinutes,
			@Value("${app.session.max-hours}") int maxHours) {
		this.adminIdle = Duration.ofMinutes(adminIdleMinutes);
		this.studentIdle = Duration.ofMinutes(studentIdleMinutes);
		this.maxLength = Duration.ofHours(maxHours);
	}

	/** Admins can do more damage, so their sessions time out sooner. */
	public Duration idleTimeout(Role role) {
		return role == Role.ADMIN ? adminIdle : studentIdle;
	}

	public Duration maxLength() {
		return maxLength;
	}

}
