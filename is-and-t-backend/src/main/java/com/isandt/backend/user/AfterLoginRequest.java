package com.isandt.backend.user;

import jakarta.validation.constraints.NotNull;

/** Body of PUT /api/account/after-login: {"afterLogin": "HOME" | "LAST_PAGE"}. */
public record AfterLoginRequest(@NotNull AfterLogin afterLogin) {
}
