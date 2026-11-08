package com.isandt.backend.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** A set-password or reset link's token, to check it or ask for a new link. */
public record LinkRequest(@NotBlank @Size(max = 200) String token) {
}
