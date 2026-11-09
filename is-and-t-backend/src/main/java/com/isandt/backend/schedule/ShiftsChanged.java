package com.isandt.backend.schedule;

/**
 * Published (an application event) whenever a student's shifts change. The schedule package
 * doesn't know who cares; the task package listens and re-checks that student's tasks.
 */
public record ShiftsChanged(Long studentId) {
}
