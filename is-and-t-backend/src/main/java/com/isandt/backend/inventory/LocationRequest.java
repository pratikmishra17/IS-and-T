package com.isandt.backend.inventory;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LocationRequest(
		@NotBlank @Size(max = 100) String building,
		@NotBlank @Size(max = 50) String room,
		@Size(max = 255) String description) {
}
