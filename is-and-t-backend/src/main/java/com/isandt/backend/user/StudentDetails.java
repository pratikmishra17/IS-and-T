package com.isandt.backend.user;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** A student's details, as an admin types them when adding or editing. The student ID is required. */
public record StudentDetails(
		@NotBlank @Size(max = 100) String firstName,
		@NotBlank @Size(max = 100) String lastName,
		@NotBlank @Email @Size(max = 255) String email,
		@NotBlank @Size(max = 50) String studentId) {
}
