package com.isandt.backend.calendar;

/**
 * Published (an application event) when holidays are added. Weekly shifts don't apply on holidays,
 * so the task package re-checks everyone's upcoming tasks.
 */
public record HolidaysAdded() {
}
