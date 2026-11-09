package com.isandt.backend.calendar;

/** Each type comes with the usual weekly hour limit for student workers; admins can change it per semester. */
public enum SemesterType {

	FALL(20), SPRING(20), SUMMER(40);

	private final int defaultWeeklyHourLimit;

	SemesterType(int defaultWeeklyHourLimit) {
		this.defaultWeeklyHourLimit = defaultWeeklyHourLimit;
	}

	public int defaultWeeklyHourLimit() {
		return defaultWeeklyHourLimit;
	}

}
