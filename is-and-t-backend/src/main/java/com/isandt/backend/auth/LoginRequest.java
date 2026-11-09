package com.isandt.backend.auth;

import com.isandt.backend.user.Role;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * A login attempt. {@code portal} is the portal the person is logging in to: students may only
 * log in to the student portal (STUDENT) and admins only to the admin portal (ADMIN).
 */
public record LoginRequest(@NotBlank String email, @NotBlank String password, @NotNull Role portal) {
}
