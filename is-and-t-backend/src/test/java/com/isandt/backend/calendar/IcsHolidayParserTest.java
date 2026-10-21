package com.isandt.backend.calendar;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;

class IcsHolidayParserTest {

	@Test
	void anAllDayEventBecomesOneHolidayPerDayWithTheEndDateExcluded() {
		String ics = """
				BEGIN:VCALENDAR
				BEGIN:VEVENT
				DTSTART;VALUE=DATE:20261126
				DTEND;VALUE=DATE:20261128
				SUMMARY:Thanksgiving Break
				END:VEVENT
				END:VCALENDAR
				""";

		assertThat(IcsHolidayParser.parse(ics)).containsExactly(
				new IcsHolidayParser.ParsedHoliday(LocalDate.of(2026, 11, 26), "Thanksgiving Break"),
				new IcsHolidayParser.ParsedHoliday(LocalDate.of(2026, 11, 27), "Thanksgiving Break"));
	}

	@Test
	void eventsWithATimeOfDayAreNotHolidays() {
		String ics = """
				BEGIN:VEVENT
				DTSTART:20261126T090000Z
				DTEND:20261126T100000Z
				SUMMARY:Staff meeting
				END:VEVENT
				""";

		assertThat(IcsHolidayParser.parse(ics)).isEmpty();
	}

	@Test
	void handlesWindowsLineEndingsFoldedLinesAndEscapes() {
		String ics = "BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20260907\r\nSUMMARY;LANGUAGE=en:Labor Day\\, \r\n campus closed\r\nEND:VEVENT\r\n";

		List<IcsHolidayParser.ParsedHoliday> holidays = IcsHolidayParser.parse(ics);

		assertThat(holidays).containsExactly(
				new IcsHolidayParser.ParsedHoliday(LocalDate.of(2026, 9, 7), "Labor Day, campus closed"));
	}

}
