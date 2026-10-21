package com.isandt.backend.schedule;

public enum ShiftExceptionType {
	/** No shifts on this date (sick day, exam day). */
	CANCEL,
	/** An added shift on this date. */
	EXTRA
}
