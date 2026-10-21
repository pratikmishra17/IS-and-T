package com.isandt.backend.task;

public enum TaskStatus {
	UNASSIGNED, ASSIGNED, COMPLETED, NOT_COMPLETED, CANCELLED;

	/** Still to be done: it can be assigned, rescheduled or cancelled. */
	public boolean isOpen() {
		return this == UNASSIGNED || this == ASSIGNED;
	}
}
