package com.isandt.backend.task;

import jakarta.validation.constraints.NotNull;

/** A student handing their task to a colleague. */
public record HandOffRequest(@NotNull Long studentId) {
}
