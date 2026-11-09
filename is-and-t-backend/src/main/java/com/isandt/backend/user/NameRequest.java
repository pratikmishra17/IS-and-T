package com.isandt.backend.user;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Changing your own name on the My account page. */
public record NameRequest(@NotBlank @Size(max = 100) String firstName, @NotBlank @Size(max = 100) String lastName) {
}
