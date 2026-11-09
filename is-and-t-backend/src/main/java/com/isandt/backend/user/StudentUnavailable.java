package com.isandt.backend.user;

/** Published when a student is disabled or about to be removed, so their open tasks can be reassigned. */
public record StudentUnavailable(Long studentId, String reason) {
}
