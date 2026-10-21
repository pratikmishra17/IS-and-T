package com.isandt.backend.task;

/** An admin assigning a task to a student, or unassigning it (studentId null). */
public record AssignRequest(Long studentId) {
}
