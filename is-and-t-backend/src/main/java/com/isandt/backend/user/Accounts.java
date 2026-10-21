package com.isandt.backend.user;

import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.isandt.backend.auth.PasswordTokenService;
import com.isandt.backend.auth.TokenPurpose;
import com.isandt.backend.common.error.ConflictException;
import com.isandt.backend.common.error.NotFoundException;

/**
 * Questions that span both tables: "who has this email?" for login and password resets, and
 * "is this email free?" when adding someone. PostgreSQL can keep an email unique within one table,
 * but not across two, so that rule is checked here before every insert.
 */
@Service
public class Accounts {

	private final AdminRepository admins;

	private final StudentRepository students;

	Accounts(AdminRepository admins, StudentRepository students) {
		this.admins = admins;
		this.students = students;
	}

	@Transactional(readOnly = true)
	public Optional<Account> findByEmail(String email) {
		String normalized = Account.normalizeEmail(email);
		return admins.findByEmail(normalized).map(Account.class::cast)
				.or(() -> students.findByEmail(normalized).map(Account.class::cast));
	}

	/** Throws if a student or an admin already uses this email. */
	void requireEmailFree(String email) {
		String normalized = Account.normalizeEmail(email);
		if (admins.existsByEmail(normalized) || students.existsByEmail(normalized)) {
			throw new ConflictException("An account with this email already exists.");
		}
	}

	/** Same, when editing: keeping your own current email is fine. */
	void requireEmailFree(String email, Account owner) {
		if (!owner.getEmail().equals(Account.normalizeEmail(email))) {
			requireEmailFree(email);
		}
	}

	/** What the session check needs about an account, read fresh on every request. */
	public record SessionState(boolean active, int sessionVersion, boolean mustChangePassword) {
	}

	@Transactional(readOnly = true)
	public Optional<SessionState> sessionState(Role role, Long id) {
		Optional<? extends Account> account = role == Role.ADMIN ? admins.findById(id) : students.findById(id);
		return account.map(a -> new SessionState(a.isActive(), a.getSessionVersion(), a.isMustChangePassword()));
	}

	/** The logged-in person, from the role and id stored in their session. */
	@Transactional(readOnly = true)
	public AccountResponse describe(Role role, Long id) {
		return AccountResponse.from(find(role, id));
	}

	public Account find(Role role, Long id) {
		Optional<? extends Account> account = role == Role.ADMIN ? admins.findById(id) : students.findById(id);
		return account.orElseThrow(() -> new NotFoundException("Account not found."));
	}

	/**
	 * Emails a set-password link: the "you've been added" email if they never set a password,
	 * otherwise a reset email. Used by the admin portal's "Send set-password link".
	 */
	static void sendPasswordLink(Account account, PasswordTokenService tokens, AccountEmails emails) {
		if (!account.isActive()) {
			throw new ConflictException("Enable this account before sending a link.");
		}
		if (account.getPasswordHash() == null) {
			emails.added(account, tokens.issue(account, TokenPurpose.SET_PASSWORD));
		}
		else {
			emails.passwordReset(account, tokens.issue(account, TokenPurpose.RESET_PASSWORD));
		}
	}

}
