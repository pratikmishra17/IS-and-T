package com.isandt.backend.calendar;

import java.time.LocalDate;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** A semester as an admin types it, when adding or editing. Dates arrive as "2026-08-24". */
public record SemesterDetails(
		@NotBlank @Size(max = 100) String name,
		@NotNull SemesterType type,
		@NotNull LocalDate startDate,
		@NotNull LocalDate endDate,
		@Min(1) @Max(80) int weeklyHourLimit) {
}
