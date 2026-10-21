package com.isandt.backend.user;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.isandt.backend.common.error.ConflictException;

/** What anyone logged in (student or admin) can change about their own account. */
@Service
public class MyAccountService {

	private final Accounts accounts;

	private final PasswordEncoder passwordEncoder;

	MyAccountService(Accounts accounts, PasswordEncoder passwordEncoder) {
		this.accounts = accounts;
		this.passwordEncoder = passwordEncoder;
	}

	@Transactional
	public AccountResponse rename(Role role, Long id, NameRequest request) {
		Account account = accounts.find(role, id);
		account.rename(request.firstName(), request.lastName());
		return AccountResponse.from(account);
	}

	/**
	 * Requires the current password, so someone who finds a logged-in laptop can't lock the owner
	 * out. passwordEncoder.matches() hashes the typed password the same way and compares. Every other
	 * session of the account is signed out; returns the new session version for the current one.
	 */
	@Transactional
	public int changePassword(Role role, Long id, ChangePasswordRequest request) {
		Account account = accounts.find(role, id);
		if (!passwordEncoder.matches(request.currentPassword(), account.getPasswordHash())) {
			throw new ConflictException("Your current password is incorrect.");
		}
		if (passwordEncoder.matches(request.newPassword(), account.getPasswordHash())) {
			throw new ConflictException("Choose a password different from your current one.");
		}
		account.changePasswordHash(passwordEncoder.encode(request.newPassword()));
		return account.getSessionVersion();
	}

}
