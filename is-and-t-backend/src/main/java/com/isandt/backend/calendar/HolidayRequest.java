package com.isandt.backend.calendar;

import java.time.LocalDate;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Adding a holiday by hand: one day (no "to"), or every day from "from" to "to". */
public record HolidayRequest(@NotBlank @Size(max = 200) String name, @NotNull LocalDate from, LocalDate to) {
}
