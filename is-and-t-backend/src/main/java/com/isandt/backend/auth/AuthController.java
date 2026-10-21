package com.isandt.backend.auth;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
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

import com.isandt.backend.user.AccountResponse;
import com.isandt.backend.user.Accounts;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

	private final AuthService authService;

	private final Accounts accounts;

	private final AuthenticationManager authenticationManager;

	private final SecurityContextRepository securityContextRepository;

	AuthController(AuthService authService, Accounts accounts, AuthenticationManager authenticationManager,
			SecurityContextRepository securityContextRepository) {
		this.authService = authService;
		this.accounts = accounts;
		this.authenticationManager = authenticationManager;
		this.securityContextRepository = securityContextRepository;
	}

	/**
	 * Checks the email and password, then stores the logged-in user in the HTTP session.
	 * A wrong email or password throws AuthenticationException, which becomes a 401.
	 */
	@PostMapping("/login")
	AccountResponse login(@Valid @RequestBody LoginRequest request, HttpServletRequest httpRequest,
			HttpServletResponse httpResponse) {
		Authentication authentication = authenticationManager
				.authenticate(UsernamePasswordAuthenticationToken.unauthenticated(request.email(), request.password()));

		// Give the session a new ID at login, so a session ID planted before login can't be reused.
		if (httpRequest.getSession(false) != null) {
			httpRequest.changeSessionId();
		}
		SecurityContext context = SecurityContextHolder.createEmptyContext();
		context.setAuthentication(authentication);
		SecurityContextHolder.setContext(context);
		securityContextRepository.saveContext(context, httpRequest, httpResponse);

		AuthenticatedUser user = (AuthenticatedUser) authentication.getPrincipal();
		return accounts.describe(user.getRole(), user.getId());
	}

	/**
	 * Who is logged in: the user, or 204 No Content if nobody is. Angular calls this when the app
	 * starts. Reading the CSRF token here also makes Spring set the XSRF-TOKEN cookie, which the
	 * app needs before it can send its first POST (such as login).
	 */
	@GetMapping("/me")
	ResponseEntity<AccountResponse> me(@AuthenticationPrincipal AuthenticatedUser user, CsrfToken csrfToken) {
		csrfToken.getToken();
		if (user == null) {
			return ResponseEntity.noContent().build();
		}
		return ResponseEntity.ok(accounts.describe(user.getRole(), user.getId()));
	}

	@PostMapping("/set-password")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void setPassword(@Valid @RequestBody SetPasswordRequest request) {
		authService.setPassword(request);
	}

	@PostMapping("/forgot-password")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
		authService.requestPasswordReset(request);
	}

}
