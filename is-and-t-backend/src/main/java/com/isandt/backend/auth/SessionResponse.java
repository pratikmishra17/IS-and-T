package com.isandt.backend.auth;

import java.time.Instant;

import com.isandt.backend.user.AccountResponse;

/**
 * Who is logged in, plus what the browser needs to manage the session: when it times out if idle,
 * when it ends regardless, and whether a new password must be chosen before anything else.
 */
public record SessionResponse(AccountResponse user, long idleTimeoutSeconds, Instant expiresAt,
		boolean mustChangePassword) {
}
