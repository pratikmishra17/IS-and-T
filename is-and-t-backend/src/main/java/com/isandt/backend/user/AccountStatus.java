package com.isandt.backend.user;

public enum AccountStatus {
	/** Can log in once a password has been set from the emailed link. */
	ACTIVE,
	/** Switched off by an admin. Cannot log in; the account and its history are kept. */
	DISABLED
}
