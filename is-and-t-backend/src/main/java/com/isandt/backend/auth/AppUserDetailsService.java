package com.isandt.backend.auth;

import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import com.isandt.backend.user.Accounts;

/**
 * How Spring Security looks up the email typed at login, in the admins table and then the
 * students table. Spring then compares the typed password against the stored hash itself.
 */
@Service
class AppUserDetailsService implements UserDetailsService {

	private final Accounts accounts;

	AppUserDetailsService(Accounts accounts) {
		this.accounts = accounts;
	}

	@Override
	public UserDetails loadUserByUsername(String email) {
		return accounts.findByEmail(email)
				.filter(account -> account.getPasswordHash() != null)
				.map(AuthenticatedUser::new)
				.orElseThrow(() -> new UsernameNotFoundException("No account with a password for this email"));
	}

}
