package com.isandt.backend.schedule;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalTime;
import java.time.format.TextStyle;
import java.util.Locale;

import com.fasterxml.jackson.annotation.JsonFormat;

import jakarta.validation.constraints.NotNull;

/**
 * A weekly time block: "MONDAY 09:00–13:00". Used for class times, preferred hours and shifts.
 * Times travel as "09:00" (@JsonFormat), the same format an HTML time input uses.
 */
public record TimeBlock(
		@NotNull DayOfWeek day,
		@NotNull @JsonFormat(pattern = "HH:mm") LocalTime start,
		@NotNull @JsonFormat(pattern = "HH:mm") LocalTime end) {

	public long minutes() {
		return Duration.between(start, end).toMinutes();
	}

	/** Same day, and the time ranges share at least one minute (back-to-back blocks don't overlap). */
	public boolean overlaps(TimeBlock other) {
		return day == other.day && start.isBefore(other.end) && other.start.isBefore(end);
	}

	public boolean isWeekend() {
		return day == DayOfWeek.SATURDAY || day == DayOfWeek.SUNDAY;
	}

	/** "Monday 09:00–13:00", for messages. */
	public String describe() {
		return day.getDisplayName(TextStyle.FULL, Locale.US) + " " + start + "–" + end;
	}

}
