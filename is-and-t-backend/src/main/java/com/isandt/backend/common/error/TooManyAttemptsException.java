package com.isandt.backend.common.error;

/** Too many tries in a short time (wrong passwords, reset requests). Returned as 429 Too Many Requests. */
public class TooManyAttemptsException extends RuntimeException {

	public TooManyAttemptsException(String message) {
		super(message);
	}

}
