package com.isandt.backend.calendar;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Editing a holiday: its days now (ids, a range shows as one holiday) become the name and dates given. */
public record HolidayEdit(@NotEmpty @Size(max = 400) List<@NotNull Long> ids, @NotNull @Valid HolidayRequest holiday) {
}
