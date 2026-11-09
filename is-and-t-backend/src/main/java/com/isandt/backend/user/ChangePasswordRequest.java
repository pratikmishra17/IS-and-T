package com.isandt.backend.user;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Changing your own password: the current one proves it's really you at the keyboard. */
public record ChangePasswordRequest(
		@NotBlank String currentPassword,
		@NotBlank @Size(min = 8, max = 72, message = "must be between 8 and 72 characters") String newPassword) {
}
