package com.isandt.backend.auth;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.isandt.backend.common.error.ConflictException;
import com.isandt.backend.user.Account;
import com.isandt.backend.user.AccountEmails;
import com.isandt.backend.user.Accounts;
import com.isandt.backend.user.Role;

/**
 * What anyone can do without being logged in: set a password from an email link, and ask for
 * a password reset. There is no self-registration; admins add every account.
 */
@Service
public class AuthService {

	private final Accounts accounts;

	private final PasswordTokenService passwordTokens;

	private final PasswordEncoder passwordEncoder;

	private final AccountEmails emails;

	AuthService(Accounts accounts, PasswordTokenService passwordTokens, PasswordEncoder passwordEncoder,
			AccountEmails emails) {
		this.accounts = accounts;
		this.passwordTokens = passwordTokens;
		this.passwordEncoder = passwordEncoder;
		this.emails = emails;
	}

	@Transactional
	public Role setPassword(SetPasswordRequest request) {
		Account account = passwordTokens.redeem(request.token());
		if (!account.isActive()) {
			throw new ConflictException("This account is not active.");
		}
		account.changePasswordHash(passwordEncoder.encode(request.password()));
		return account.getRole();
	}

	/**
	 * Sends a reset link only if an admin has added this email, as a student or an admin (and the
	 * account isn't disabled). This also covers someone whose first "you've been added" link
	 * expired. It always succeeds from the caller's point of view, so it can't be used to find out
	 * who has an account.
	 */
	@Transactional
	public void requestPasswordReset(ForgotPasswordRequest request) {
		accounts.findByEmail(request.email())
				.filter(Account::isActive)
				.ifPresent(account -> emails.passwordReset(account,
						passwordTokens.issue(account, TokenPurpose.RESET_PASSWORD)));
	}

}
