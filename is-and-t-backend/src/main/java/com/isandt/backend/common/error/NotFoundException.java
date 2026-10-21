package com.isandt.backend.common.error;

/**
 * Thrown when a requested record doesn't exist. Returned to the client as 404 Not Found.
 */
public class NotFoundException extends RuntimeException {

	public NotFoundException(String message) {
		super(message);
	}

}
