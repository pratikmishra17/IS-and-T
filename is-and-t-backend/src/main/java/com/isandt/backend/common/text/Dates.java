package com.isandt.backend.common.text;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/** Dates as people read them in messages, warnings and the activity log: "Wed, Nov 11". */
public final class Dates {

	private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEE, MMM d", Locale.US);

	private static final DateTimeFormatter DAY_WITH_YEAR = DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.US);

	private Dates() {
	}

	/** "Wed, Nov 11". */
	public static String day(LocalDate date) {
		return date.format(DAY);
	}

	/** "Nov 11, 2026", where the year matters (semesters). */
	public static String dayWithYear(LocalDate date) {
		return date.format(DAY_WITH_YEAR);
	}

	/** "Wed, Nov 11" or "Wed, Nov 11 to Fri, Nov 13". */
	public static String range(LocalDate from, LocalDate to) {
		return to == null || to.equals(from) ? day(from) : day(from) + " to " + day(to);
	}

}
