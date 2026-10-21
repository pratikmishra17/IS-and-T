package com.isandt.backend.portal;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.nio.charset.StandardCharsets;

/**
 * Writes an iCalendar (.ics) file, the format calendar apps subscribe to (the same format the
 * holiday import reads). The rules that matter: lines end with CRLF, lines longer than 75 bytes are
 * "folded" (continued on the next line after a space), and commas, semicolons, backslashes and
 * newlines in text are escaped. Times are written in UTC (ending in Z), so no time-zone block is needed.
 */
final class IcsWriter {

	private static final DateTimeFormatter UTC = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC);

	private final StringBuilder out = new StringBuilder();

	IcsWriter(String calendarName) {
		line("BEGIN:VCALENDAR");
		line("VERSION:2.0");
		line("PRODID:-//IS&T Portal//Schedule//EN");
		line("CALSCALE:GREGORIAN");
		line("X-WR-CALNAME:" + escape(calendarName));
		line("REFRESH-INTERVAL;VALUE=DURATION:PT1H");
		line("X-PUBLISHED-TTL:PT1H");
	}

	IcsWriter event(String uid, Instant start, Instant end, String summary, String location, String description) {
		line("BEGIN:VEVENT");
		line("UID:" + uid);
		line("DTSTAMP:" + UTC.format(Instant.now()));
		line("DTSTART:" + UTC.format(start));
		line("DTEND:" + UTC.format(end));
		line("SUMMARY:" + escape(summary));
		if (location != null) {
			line("LOCATION:" + escape(location));
		}
		if (description != null) {
			line("DESCRIPTION:" + escape(description));
		}
		line("END:VEVENT");
		return this;
	}

	String finish() {
		line("END:VCALENDAR");
		return out.toString();
	}

	static String escape(String text) {
		return text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r\n", "\\n").replace("\n", "\\n");
	}

	/** Adds a line, folding it every 75 bytes (UTF-8) as the format requires. */
	private void line(String text) {
		int bytes = 0;
		StringBuilder current = new StringBuilder();
		for (int i = 0; i < text.length(); i++) {
			char c = text.charAt(i);
			int size = String.valueOf(c).getBytes(StandardCharsets.UTF_8).length;
			if (bytes + size > 75) {
				out.append(current).append("\r\n ");
				current.setLength(0);
				bytes = 1; // the leading space counts
			}
			current.append(c);
			bytes += size;
		}
		out.append(current).append("\r\n");
	}

}
