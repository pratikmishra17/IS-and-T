package com.isandt.backend.auth;

import com.isandt.backend.user.Role;

/** After setting a password: whose account it was, so the app can open the right portal's login page. */
public record SetPasswordResponse(Role role) {
}
