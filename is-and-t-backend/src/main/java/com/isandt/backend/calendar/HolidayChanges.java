package com.isandt.backend.calendar;

/** What adding or importing did: days added, and days skipped because they were already holidays. */
public record HolidayChanges(int added, int skipped) {
}
