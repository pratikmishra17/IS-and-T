package com.isandt.backend.timeoff;

import java.time.LocalDate;
import java.time.LocalTime;

import com.fasterxml.jackson.annotation.JsonFormat;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** What a student asks for: a date, and start/end for part of a day (both empty for the whole day). */
public record TimeOffBody(
		@NotNull LocalDate date,
		@JsonFormat(pattern = "HH:mm") LocalTime start,
		@JsonFormat(pattern = "HH:mm") LocalTime end,
		@Size(max = 500) String reason) {
}
