package com.isandt.backend.activity;

import java.time.Instant;

/**
 * One entry, as the admin portal shows it. who is null when nobody was logged in (a failed login,
 * say); role is "ADMIN", "STUDENT" or null.
 */
public record ActivityResponse(Long id, Instant at, String who, String email, String role, String action, String target,
		boolean succeeded, int status, String reason, String method, String path, String ipAddress) {

	static ActivityResponse from(ActivityEntry entry) {
		return new ActivityResponse(entry.getId(), entry.getOccurredAt(), entry.getActorName(), entry.getActorEmail(),
				entry.getActorRole(), entry.getAction(), entry.getTarget(), entry.succeeded(), entry.getStatus(),
				entry.getReason(), entry.getHttpMethod(), entry.getPath(), entry.getIpAddress());
	}

}
