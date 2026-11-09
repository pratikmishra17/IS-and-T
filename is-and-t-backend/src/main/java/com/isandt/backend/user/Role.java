package com.isandt.backend.user;

/**
 * Which kind of account someone is. Not stored as a column: it follows from the table the account
 * is in (students or admins). Spring Security uses it for access rules (hasRole("ADMIN")).
 */
public enum Role {
	STUDENT, ADMIN
}
