package com.isandt.backend.common.error;

/** The request is understood but not allowed for this person. Becomes a 403 with the message shown to the user. */
public class ForbiddenException extends RuntimeException {

	public ForbiddenException(String message) {
		super(message);
	}

}
