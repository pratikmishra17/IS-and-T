package com.isandt.backend.user;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.isandt.backend.auth.AuthenticatedUser;

import jakarta.validation.Valid;

/** The logged-in person's own account. Any logged-in user (SecurityConfig: anyRequest().authenticated()). */
@RestController
@RequestMapping("/api/account")
public class MyAccountController {

	private final MyAccountService myAccount;

	MyAccountController(MyAccountService myAccount) {
		this.myAccount = myAccount;
	}

	@PutMapping("/name")
	AccountResponse rename(@Valid @RequestBody NameRequest request, @AuthenticationPrincipal AuthenticatedUser me) {
		return myAccount.rename(me.getRole(), me.getId(), request);
	}

	@PostMapping("/password")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void changePassword(@Valid @RequestBody ChangePasswordRequest request,
			@AuthenticationPrincipal AuthenticatedUser me) {
		myAccount.changePassword(me.getRole(), me.getId(), request);
	}

}
