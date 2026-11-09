package com.isandt.backend.portal;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;

import org.junit.jupiter.api.Test;

class IcsWriterTest {

	@Test
	void writesAValidEventWithEscapedTextUtcTimesAndCrlfLines() {
		String ics = new IcsWriter("IS&T: Sam's shifts").event("task-9@isandt", Instant.parse("2026-10-26T14:00:00Z"),
				Instant.parse("2026-10-26T14:30:00Z"), "Setup, dock; monitors", "RT 1408", "Line one\nLine two").finish();

		assertThat(ics).startsWith("BEGIN:VCALENDAR\r\n").endsWith("END:VCALENDAR\r\n");
		assertThat(ics).contains("DTSTART:20261026T140000Z\r\n", "SUMMARY:Setup\\, dock\\; monitors\r\n",
				"DESCRIPTION:Line one\\nLine two\r\n");
	}

	@Test
	void longLinesAreFoldedAt75Bytes() {
		String ics = new IcsWriter("x").event("u", Instant.EPOCH, Instant.EPOCH, "a".repeat(200), null, null).finish();

		for (String line : ics.split("\r\n")) {
			assertThat(line.getBytes().length).isLessThanOrEqualTo(75);
		}
		assertThat(ics.replace("\r\n ", "")).contains("SUMMARY:" + "a".repeat(200));
	}

}
