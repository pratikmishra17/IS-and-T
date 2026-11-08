package com.isandt.backend.auth;

import java.time.Clock;
import java.time.Instant;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.isandt.backend.activity.ActivityLog;
import com.isandt.backend.activity.Activity;
import com.isandt.backend.common.error.ConflictException;
import com.isandt.backend.common.error.ForbiddenException;
import com.isandt.backend.user.Account;
import com.isandt.backend.user.Accounts;
import com.isandt.backend.user.Role;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

	private final AuthService authService;

	private final Accounts accounts;

	private final AuthenticationManager authenticationManager;

	private final SecurityContextRepository securityContextRepository;

	private final LoginThrottle throttle;

	private final SessionPolicy policy;

	private final Clock clock;

	private final PasswordTokenService passwordTokens;

	AuthController(AuthService authService, Accounts accounts, AuthenticationManager authenticationManager,
			SecurityContextRepository securityContextRepository, LoginThrottle throttle, SessionPolicy policy, Clock clock,
			PasswordTokenService passwordTokens) {
		this.authService = authService;
		this.passwordTokens = passwordTokens;
		this.accounts = accounts;
		this.authenticationManager = authenticationManager;
		this.securityContextRepository = securityContextRepository;
		this.throttle = throttle;
		this.policy = policy;
		this.clock = clock;
	}

	/**
	 * Checks the email and password, then stores the logged-in user in the HTTP session.
	 * A wrong email or password throws AuthenticationException, which becomes a 401. Too many
	 * failures for one email or from one network address are refused for a while (429).
	 */
	@Activity("Logged in")
	@PostMapping("/login")
	SessionResponse login(@Valid @RequestBody LoginRequest request, HttpServletRequest httpRequest,
			HttpServletResponse httpResponse) {
		String email = Account.normalizeEmail(request.email());
		ActivityLog.about(email); // so a failed login shows which account was tried
		String address = httpRequest.getRemoteAddr();
		throttle.check(LoginThrottle.LOGIN_PER_ACCOUNT, email);
		throttle.check(LoginThrottle.LOGIN_PER_ADDRESS, address);
		Authentication authentication;
		try {
			authentication = authenticationManager
					.authenticate(UsernamePasswordAuthenticationToken.unauthenticated(email, request.password()));
		}
		catch (AuthenticationException ex) {
			throttle.record(LoginThrottle.LOGIN_PER_ACCOUNT, email);
			throttle.record(LoginThrottle.LOGIN_PER_ADDRESS, address);
			throw ex;
		}
		throttle.reset(LoginThrottle.LOGIN_PER_ACCOUNT, email);

		// Each portal is for one role: a right password in the wrong portal still gets no session.
		AuthenticatedUser user = (AuthenticatedUser) authentication.getPrincipal();
		if (user.getRole() != request.portal()) {
			throw new ForbiddenException(user.getRole() == Role.ADMIN
					? "This is the student portal. Admins log in at the admin portal."
					: "This account doesn't have admin access. Students log in at the student portal.");
		}

		// Give the session a new ID at login, so a session ID planted before login can't be reused.
		if (httpRequest.getSession(false) != null) {
			httpRequest.changeSessionId();
		}
		SecurityContext context = SecurityContextHolder.createEmptyContext();
		context.setAuthentication(authentication);
		SecurityContextHolder.setContext(context);
		securityContextRepository.saveContext(context, httpRequest, httpResponse);

		// What SessionGuardFilter checks on every later request, and the role's idle timeout.
		HttpSession session = httpRequest.getSession();
		session.setAttribute(SessionGuardFilter.LOGIN_AT, Instant.now(clock));
		session.setAttribute(SessionGuardFilter.VERSION, accounts.sessionState(user.getRole(), user.getId())
				.orElseThrow().sessionVersion());
		session.setMaxInactiveInterval((int) policy.idleTimeout(user.getRole()).toSeconds());
		return describe(user, session);
	}

	/**
	 * Who is logged in: their session details, or 204 No Content if nobody is. Angular calls this when
	 * the app starts and before opening a logged-in page. Reading the CSRF token here also makes Spring
	 * set the XSRF-TOKEN cookie, which the app needs before it can send its first POST (such as login).
	 */
	@GetMapping("/me")
	ResponseEntity<SessionResponse> me(@AuthenticationPrincipal AuthenticatedUser user, CsrfToken csrfToken,
			HttpServletRequest httpRequest) {
		csrfToken.getToken();
		HttpSession session = httpRequest.getSession(false);
		if (user == null || session == null) {
			return ResponseEntity.noContent().build();
		}
		return ResponseEntity.ok(describe(user, session));
	}

	/** Answers with the account's role, so the app can send the person to the right portal's login page. */
	@Activity("Set a password from an email link")
	@PostMapping("/set-password")
	SetPasswordResponse setPassword(@Valid @RequestBody SetPasswordRequest request, HttpServletRequest httpRequest) {
		String address = httpRequest.getRemoteAddr();
		throttle.check(LoginThrottle.SET_PASSWORD_PER_ADDRESS, address);
		try {
			return new SetPasswordResponse(authService.setPassword(request));
		}
		catch (ConflictException ex) {
			throttle.record(LoginThrottle.SET_PASSWORD_PER_ADDRESS, address); // a wrong or used link
			throw ex;
		}
	}

	/**
	 * The set-password page checks its link as it opens: {"state": "VALID" | "USED" | "EXPIRED" | "INVALID"}.
	 * POST, so the token stays out of URLs and logs. Unknown tokens count toward the same limit as
	 * wrong set-password attempts, so tokens can't be guessed here either.
	 */
	@Activity("Opened a set-password link")
	@PostMapping("/password-link/check")
	Map<String, PasswordTokenService.LinkState> checkLink(@Valid @RequestBody LinkRequest request, HttpServletRequest httpRequest) {
		String address = httpRequest.getRemoteAddr();
		throttle.check(LoginThrottle.SET_PASSWORD_PER_ADDRESS, address);
		PasswordTokenService.LinkState state = passwordTokens.check(request.token());
		if (state == PasswordTokenService.LinkState.INVALID) {
			throttle.record(LoginThrottle.SET_PASSWORD_PER_ADDRESS, address);
		}
		return Map.of("state", state);
	}

	/** "Send me a new one" for a used or expired link. Always 204, limited like forgot-password. */
	@Activity("Asked for a new set-password link")
	@PostMapping("/password-link/renew")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void renewLink(@Valid @RequestBody LinkRequest request, HttpServletRequest httpRequest) {
		String address = httpRequest.getRemoteAddr();
		throttle.check(LoginThrottle.RESET_PER_ADDRESS, address);
		throttle.record(LoginThrottle.RESET_PER_ADDRESS, address);
		authService.renewLink(request.token());
	}

	/** Limited per email and per address, so it can't be used to flood someone's inbox. */
	@Activity("Asked for a password reset link")
	@PostMapping("/forgot-password")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void forgotPassword(@Valid @RequestBody ForgotPasswordRequest request, HttpServletRequest httpRequest) {
		String email = Account.normalizeEmail(request.email());
		ActivityLog.about(email);
		String address = httpRequest.getRemoteAddr();
		throttle.check(LoginThrottle.RESET_PER_ACCOUNT, email);
		throttle.check(LoginThrottle.RESET_PER_ADDRESS, address);
		throttle.record(LoginThrottle.RESET_PER_ACCOUNT, email);
		throttle.record(LoginThrottle.RESET_PER_ADDRESS, address);
		authService.requestPasswordReset(request);
	}

	private SessionResponse describe(AuthenticatedUser user, HttpSession session) {
		Instant loginAt = (Instant) session.getAttribute(SessionGuardFilter.LOGIN_AT);
		boolean mustChange = accounts.sessionState(user.getRole(), user.getId())
				.map(Accounts.SessionState::mustChangePassword).orElse(false);
		return new SessionResponse(accounts.describe(user.getRole(), user.getId()), session.getMaxInactiveInterval(),
				loginAt == null ? null : loginAt.plus(policy.maxLength()), mustChange);
	}

}
