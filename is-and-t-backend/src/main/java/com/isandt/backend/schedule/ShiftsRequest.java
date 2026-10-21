package com.isandt.backend.schedule;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * An admin setting a student's weekly shifts for a semester. With requestId, this also approves
 * that request (and emails the student).
 */
public record ShiftsRequest(@NotNull @Size(max = 30) List<@Valid TimeBlock> shifts, Long requestId) {
}
