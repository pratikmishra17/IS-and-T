package com.isandt.backend.user;

import java.time.Instant;
import java.util.Locale;

import jakarta.persistence.Column;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MappedSuperclass;

/**
 * What students and admins have in common: someone who can log in.
 * <p>
 * {@code @MappedSuperclass} shares these fields and methods with {@link Student} and {@link Admin}
 * without sharing a table: each subclass has its own table (students, admins) containing these
 * columns plus its own. Fields change only through the methods below, so an account can't end up
 * in a state the business rules don't allow.
 */
@MappedSuperclass
public abstract class Account {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false, unique = true)
	private String email;

	@Column(nullable = false)
	private String firstName;

	@Column(nullable = false)
	private String lastName;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private AccountStatus status;

	/** Null until the person sets a password from their "you've been added" email. */
	private String passwordHash;

	/** The admin who added this account; null for the dev seed admin. */
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "created_by_id")
	private Admin createdBy;

	@Column(nullable = false)
	private Instant createdAt;

	/**
	 * Every login session remembers this number. Bumping it (disable, new password) makes all of the
	 * account's existing sessions invalid on their next request (see SessionGuardFilter).
	 */
	private int sessionVersion;

	/** True until the person picks a new password; meanwhile they can do nothing else. */
	private boolean mustChangePassword;

	/** What opens after logging in (their choice on the Account page). */
	@Enumerated(EnumType.STRING)
	@Column(name = "after_login", nullable = false)
	private AfterLogin afterLogin = AfterLogin.HOME;

	/** Required by JPA, which creates the object first and then fills in the fields. */
	protected Account() {
	}

	protected Account(String email, String firstName, String lastName, Admin createdBy) {
		this.email = normalizeEmail(email);
		this.firstName = firstName.trim();
		this.lastName = lastName.trim();
		this.status = AccountStatus.ACTIVE;
		this.createdBy = createdBy;
		this.createdAt = Instant.now();
	}

	/** STUDENT or ADMIN: which table this account lives in, and what it may do after logging in. */
	public abstract Role getRole();

	/** Emails are compared case-insensitively, so they are always stored trimmed and lowercase. */
	public static String normalizeEmail(String email) {
		return email.trim().toLowerCase(Locale.ROOT);
	}

	public void chooseAfterLogin(AfterLogin afterLogin) {
		this.afterLogin = afterLogin;
	}

	public AfterLogin getAfterLogin() {
		return afterLogin;
	}

	public void rename(String firstName, String lastName) {
		this.firstName = firstName.trim();
		this.lastName = lastName.trim();
	}

	public void changeEmail(String email) {
		this.email = normalizeEmail(email);
	}

	public void disable() {
		this.status = AccountStatus.DISABLED;
		endSessions();
	}

	/** Signs the account out everywhere, on each session's next request. */
	public void endSessions() {
		this.sessionVersion++;
	}

	public void requirePasswordChange() {
		this.mustChangePassword = true;
	}

	public void enable() {
		this.status = AccountStatus.ACTIVE;
	}

	/**
	 * A new password signs the account out of every other session (someone who knew the old one is
	 * locked out) and clears any forced change.
	 */
	public void changePasswordHash(String passwordHash) {
		this.passwordHash = passwordHash;
		this.mustChangePassword = false;
		endSessions();
	}

	public boolean isActive() {
		return status == AccountStatus.ACTIVE;
	}

	public Long getId() {
		return id;
	}

	public String getEmail() {
		return email;
	}

	public String getFirstName() {
		return firstName;
	}

	public String getLastName() {
		return lastName;
	}

	public AccountStatus getStatus() {
		return status;
	}

	public String getPasswordHash() {
		return passwordHash;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public int getSessionVersion() {
		return sessionVersion;
	}

	public boolean isMustChangePassword() {
		return mustChangePassword;
	}

}
