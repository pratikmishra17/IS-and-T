package com.isandt.backend.user;

import jakarta.validation.constraints.NotNull;

public record TaskAccessRequest(@NotNull TaskAccess access) {
}
