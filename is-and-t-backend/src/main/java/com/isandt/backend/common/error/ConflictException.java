package com.isandt.backend.common.error;

/**
 * Thrown when a request breaks a business rule or clashes with the current state
 * (email already registered, task already claimed). Returned to the client as 409 Conflict.
 */
public class ConflictException extends RuntimeException {

	public ConflictException(String message) {
		super(message);
	}

}
