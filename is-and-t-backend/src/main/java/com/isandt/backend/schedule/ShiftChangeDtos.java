package com.isandt.backend.schedule;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonFormat;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** What travels for shift change requests. Times as "09:00", like everywhere else. */
public final class ShiftChangeDtos {

	private ShiftChangeDtos() {
	}

	public record Hours(@NotNull @JsonFormat(pattern = "HH:mm") LocalTime start,
			@NotNull @JsonFormat(pattern = "HH:mm") LocalTime end) {
	}

	/** A student's request: on this date (ONE_DAY) or this weekday from now on (EVERY_WEEK), work these hours (none = off). */
	public record ChangeRequest(@NotNull ShiftChangeRequest.Scope scope, @NotNull LocalDate date,
			@NotNull @Size(max = 6) List<@Valid Hours> hours, @Size(max = 500) String note) {
	}

	/** An admin's answer, with an optional note for the student. */
	public record Review(@Size(max = 500) String note) {
	}

	/** A request, with the hours that day has now so the change is easy to see. */
	public record ChangeResponse(Long id, Long studentId, String studentName, ShiftChangeRequest.Scope scope, LocalDate date,
			DayOfWeek day, List<Hours> hours, List<Hours> currentHours, String note, ShiftChangeRequest.Status status,
			Instant submittedAt, Instant reviewedAt, String reviewNote) {
	}

}
