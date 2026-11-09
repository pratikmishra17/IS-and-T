package com.isandt.backend.auth;

import java.time.Instant;

import com.isandt.backend.user.Account;
import com.isandt.backend.user.Admin;
import com.isandt.backend.user.Student;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/**
 * A single-use set-password link. It belongs to either a student or an admin: exactly one of the
 * two is set (the database enforces this with a CHECK constraint).
 */
@Entity
@Table(name = "password_tokens")
public class PasswordToken {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "student_id")
	private Student student;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "admin_id")
	private Admin admin;

	@Column(nullable = false, unique = true)
	private String tokenHash;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private TokenPurpose purpose;

	@Column(nullable = false)
	private Instant expiresAt;

	private Instant usedAt;

	@Column(nullable = false)
	private Instant createdAt;

	protected PasswordToken() {
	}

	PasswordToken(Account account, String tokenHash, TokenPurpose purpose, Instant expiresAt) {
		if (account instanceof Admin owner) {
			this.admin = owner;
		}
		else {
			this.student = (Student) account;
		}
		this.tokenHash = tokenHash;
		this.purpose = purpose;
		this.expiresAt = expiresAt;
		this.createdAt = Instant.now();
	}

	boolean isUsable(Instant now) {
		return usedAt == null && now.isBefore(expiresAt);
	}

	boolean isUsed() {
		return usedAt != null;
	}

	void markUsed() {
		this.usedAt = Instant.now();
	}

	Account getAccount() {
		return admin != null ? admin : student;
	}

}
