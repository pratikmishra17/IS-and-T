package com.isandt.backend.task;

import java.util.Map;

import jakarta.validation.constraints.Size;

/**
 * Finishing a task. used: planned item id → how many were really used (missing entries mean "all of
 * them"). For "couldn't complete", notes are required (checked in the service).
 */
public record OutcomeRequest(@Size(max = 2000) String notes, Map<Long, Integer> used) {
}
