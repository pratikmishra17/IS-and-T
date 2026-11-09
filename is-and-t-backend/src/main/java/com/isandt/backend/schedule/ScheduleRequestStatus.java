package com.isandt.backend.schedule;

public enum ScheduleRequestStatus {
	/** Waiting for an admin. */
	SUBMITTED,
	/** Approved exactly as the student asked. */
	APPROVED,
	/** Approved after the admin changed the hours. */
	APPROVED_WITH_CHANGES
}
