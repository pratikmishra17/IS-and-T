package com.isandt.backend.auth;

import java.util.Collection;
import java.util.List;

import org.springframework.security.core.CredentialsContainer;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import com.isandt.backend.user.Account;
import com.isandt.backend.user.Role;

/**
 * The logged-in person as Spring Security sees it, stored in the HTTP session after login.
 * Controllers receive it with @AuthenticationPrincipal to know who is calling.
 * <p>
 * Students and admins are numbered separately (student 1 and admin 1 are different people),
 * so an id only means something together with the role.
 */
public class AuthenticatedUser implements UserDetails, CredentialsContainer {

	private final Long id;

	private final String email;

	private final Role role;

	private final boolean active;

	private String passwordHash;

	AuthenticatedUser(Account account) {
		this.id = account.getId();
		this.email = account.getEmail();
		this.role = account.getRole();
		this.active = account.isActive();
		this.passwordHash = account.getPasswordHash();
	}

	/** The id in the students or admins table, depending on {@link #getRole()}. */
	public Long getId() {
		return id;
	}

	public Role getRole() {
		return role;
	}

	/** "ROLE_ADMIN" is what hasRole("ADMIN") in SecurityConfig checks for. */
	@Override
	public Collection<? extends GrantedAuthority> getAuthorities() {
		return List.of(new SimpleGrantedAuthority("ROLE_" + role.name()));
	}

	@Override
	public String getUsername() {
		return email;
	}

	@Override
	public String getPassword() {
		return passwordHash;
	}

	/** Disabled accounts fail login even with the right password. */
	@Override
	public boolean isEnabled() {
		return active;
	}

	/** Spring Security calls this after login, so the hash isn't kept in the session. */
	@Override
	public void eraseCredentials() {
		this.passwordHash = null;
	}

}
