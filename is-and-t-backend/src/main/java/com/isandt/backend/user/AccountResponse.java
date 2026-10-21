package com.isandt.backend.user;

import java.time.Instant;

/**
 * What the API sends about a student or an admin; studentId is null for admins. It deliberately
 * has no passwordHash: entities never leave the backend, only this record does. passwordSet tells
 * admins whether someone has finished setting up their account.
 */
public record AccountResponse(Long id, String email, String firstName, String lastName, Role role, String studentId,
		AccountStatus status, boolean passwordSet, Instant createdAt) {

	public static AccountResponse from(Account account) {
		String studentId = account instanceof Student student ? student.getStudentId() : null;
		return new AccountResponse(account.getId(), account.getEmail(), account.getFirstName(), account.getLastName(),
				account.getRole(), studentId, account.getStatus(), account.getPasswordHash() != null,
				account.getCreatedAt());
	}

}
