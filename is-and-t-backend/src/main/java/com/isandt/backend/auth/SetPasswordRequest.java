package com.isandt.backend.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** BCrypt only uses the first 72 bytes of a password, so longer ones are refused. */
public record SetPasswordRequest(
		@NotBlank String token,
		@NotBlank @Size(min = 8, max = 72, message = "must be between 8 and 72 characters") String password) {
}
