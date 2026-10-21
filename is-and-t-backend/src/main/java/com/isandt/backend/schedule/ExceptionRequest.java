package com.isandt.backend.schedule;

import java.time.LocalDate;
import java.time.LocalTime;

import com.fasterxml.jackson.annotation.JsonFormat;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** A one-off change: a day off (CANCEL, no times) or an extra shift (EXTRA, with times). */
public record ExceptionRequest(
		@NotNull LocalDate date,
		@NotNull ShiftExceptionType type,
		@JsonFormat(pattern = "HH:mm") LocalTime start,
		@JsonFormat(pattern = "HH:mm") LocalTime end,
		@Size(max = 255) String reason) {
}
