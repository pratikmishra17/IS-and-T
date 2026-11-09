package com.isandt.backend.auth;

import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import com.isandt.backend.user.Accounts;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

/**
 * Checks every logged-in request against the database, so the server can end sessions:
 * <ul>
 * <li>older than the maximum length (12 hours by default), however active;</li>
 * <li>for an account that has since been disabled or removed;</li>
 * <li>revoked by a password change (the account's session version moved on).</li>
 * </ul>
 * An ended session is treated as logged out from that request on (the API answers 401). Accounts
 * that must choose a new password may only do that, check who they are, or log out.
 * <p>
 * Not a Spring bean on purpose: SecurityConfig adds it to the security filter chain, in the right
 * place; as a bean, Spring Boot would also run it a second time outside that chain.
 */
public class SessionGuardFilter extends OncePerRequestFilter {

	public static final String LOGIN_AT = "isandt.loginAt";

	public static final String VERSION = "isandt.sessionVersion";

	private static final Set<String> ALLOWED_BEFORE_NEW_PASSWORD = Set.of("/api/auth/me", "/api/auth/logout",
			"/api/account/password");

	private final Accounts accounts;

	private final SessionPolicy policy;

	private final Clock clock;

	SessionGuardFilter(Accounts accounts, SessionPolicy policy, Clock clock) {
		this.accounts = accounts;
		this.policy = policy;
		this.clock = clock;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		HttpSession session = request.getSession(false);
		Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
		if (session != null && authentication != null && authentication.getPrincipal() instanceof AuthenticatedUser user) {
			Optional<Accounts.SessionState> state = accounts.sessionState(user.getRole(), user.getId());
			if (!isValid(session, state)) {
				session.invalidate();
				SecurityContextHolder.clearContext();
			}
			else if (state.get().mustChangePassword() && !ALLOWED_BEFORE_NEW_PASSWORD.contains(request.getRequestURI())) {
				response.setStatus(HttpStatus.FORBIDDEN.value());
				response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
				response.getWriter().write("{\"status\":403,\"title\":\"Forbidden\",\"detail\":\"Choose a new password first.\"}");
				return;
			}
		}
		chain.doFilter(request, response);
	}

	private boolean isValid(HttpSession session, Optional<Accounts.SessionState> state) {
		Instant loginAt = (Instant) session.getAttribute(LOGIN_AT);
		Integer version = (Integer) session.getAttribute(VERSION);
		return loginAt != null && version != null
				&& loginAt.plus(policy.maxLength()).isAfter(Instant.now(clock))
				&& state.filter(s -> s.active() && s.sessionVersion() == version).isPresent();
	}

}
