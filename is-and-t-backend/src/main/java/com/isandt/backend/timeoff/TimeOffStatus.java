package com.isandt.backend.timeoff;

public enum TimeOffStatus {
	PENDING, APPROVED, DECLINED,
	/** The student took the request back before it was reviewed. */
	WITHDRAWN
}
