package com.isandt.backend.calendar;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/**
 * Reads the all-day events out of an iCalendar (.ics) file, the format calendar apps export.
 * An .ics file is plain text, one "NAME;PARAMS:VALUE" property per line; each event sits between
 * BEGIN:VEVENT and END:VEVENT:
 *
 * <pre>
 * BEGIN:VEVENT
 * DTSTART;VALUE=DATE:20261126      all-day events have a date with no time
 * DTEND;VALUE=DATE:20261128        the end is exclusive: this event is the 26th and 27th
 * SUMMARY:Thanksgiving Break
 * END:VEVENT
 * </pre>
 *
 * Events with a time of day (a meeting at 9am) aren't holidays and are skipped, as are repeating
 * rules (RRULE): only each event's own dates are used.
 */
final class IcsHolidayParser {

	/** Longest single event that is expanded into days, so a malformed file can't create thousands. */
	static final int MAX_EVENT_DAYS = 60;

	record ParsedHoliday(LocalDate date, String name) {
	}

	private IcsHolidayParser() {
	}

	static List<ParsedHoliday> parse(String ics) {
		// Long lines are "folded": continued on the next line, which then starts with a space or tab.
		String unfolded = ics.replace("\r\n", "\n").replaceAll("\n[ \t]", "");

		List<ParsedHoliday> holidays = new ArrayList<>();
		boolean inEvent = false;
		String name = null;
		LocalDate start = null;
		LocalDate end = null;

		for (String line : unfolded.split("\n")) {
			if (line.equals("BEGIN:VEVENT")) {
				inEvent = true;
				name = null;
				start = null;
				end = null;
			}
			else if (line.equals("END:VEVENT")) {
				if (start != null) {
					LocalDate last = (end == null || !end.isAfter(start)) ? start : end.minusDays(1);
					for (LocalDate day = start; !day.isAfter(last) && day.isBefore(start.plusDays(MAX_EVENT_DAYS)); day = day.plusDays(1)) {
						holidays.add(new ParsedHoliday(day, name == null || name.isBlank() ? "Holiday" : name));
					}
				}
				inEvent = false;
			}
			else if (inEvent && line.indexOf(':') > 0) {
				String property = line.substring(0, line.indexOf(':')).split(";")[0].toUpperCase();
				String value = line.substring(line.indexOf(':') + 1).trim();
				switch (property) {
					case "SUMMARY" -> name = unescape(value);
					case "DTSTART" -> start = allDayDate(value);
					case "DTEND" -> end = allDayDate(value);
					default -> {
						// Other properties (DESCRIPTION, LOCATION, ...) aren't needed.
					}
				}
			}
		}
		return holidays;
	}

	/** "20261126" is an all-day date; "20261126T090000Z" has a time of day, so it's not a holiday. */
	private static LocalDate allDayDate(String value) {
		return value.matches("\\d{8}") ? LocalDate.parse(value, DateTimeFormatter.BASIC_ISO_DATE) : null;
	}

	/** In .ics text, commas, semicolons and backslashes are escaped with a backslash. */
	private static String unescape(String value) {
		return value.replace("\\n", " ").replace("\\N", " ").replace("\\,", ",").replace("\\;", ";")
				.replace("\\\\", "\\").trim();
	}

}
