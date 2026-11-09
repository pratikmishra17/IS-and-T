package com.isandt.backend.user;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.isandt.backend.activity.Activity;
import com.isandt.backend.auth.AuthenticatedUser;
import com.isandt.backend.auth.SessionGuardFilter;

import jakarta.servlet.http.HttpSession;

import jakarta.validation.Valid;

/** The logged-in person's own account. Any logged-in user (SecurityConfig: anyRequest().authenticated()). */
@RestController
@RequestMapping("/api/account")
public class MyAccountController {

	private final MyAccountService myAccount;

	MyAccountController(MyAccountService myAccount) {
		this.myAccount = myAccount;
	}

	@Activity("Changed their name")
	@PutMapping("/name")
	AccountResponse rename(@Valid @RequestBody NameRequest request, @AuthenticationPrincipal AuthenticatedUser me) {
		return myAccount.rename(me.getRole(), me.getId(), request);
	}

	@Activity("Chose what opens after logging in")
	@PutMapping("/after-login")
	AccountResponse chooseAfterLogin(@Valid @RequestBody AfterLoginRequest request, @AuthenticationPrincipal AuthenticatedUser me) {
		return myAccount.chooseAfterLogin(me.getRole(), me.getId(), request);
	}

	/** Your other sessions are signed out; this one is kept by moving it to the new session version. */
	@Activity("Changed their password")
	@PostMapping("/password")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void changePassword(@Valid @RequestBody ChangePasswordRequest request,
			@AuthenticationPrincipal AuthenticatedUser me, HttpSession session) {
		int version = myAccount.changePassword(me.getRole(), me.getId(), request);
		session.setAttribute(SessionGuardFilter.VERSION, version);
	}

}
