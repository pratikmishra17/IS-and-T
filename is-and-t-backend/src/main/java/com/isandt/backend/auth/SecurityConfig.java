package com.isandt.backend.auth;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;

@Configuration
public class SecurityConfig {

	/**
	 * Every request passes through this chain of filters before reaching a controller.
	 * Rules are checked top to bottom; the first match wins.
	 */
	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http, SecurityContextRepository securityContextRepository) {
		http
			.authorizeHttpRequests(auth -> auth
				.requestMatchers(HttpMethod.POST, "/api/auth/login", "/api/auth/set-password",
						"/api/auth/forgot-password").permitAll()
				.requestMatchers(HttpMethod.GET, "/api/auth/me").permitAll()
				.requestMatchers("/error").permitAll()
				.requestMatchers("/api/admin/**").hasRole("ADMIN")
				.requestMatchers("/api/me/**").hasRole("STUDENT")
				.anyRequest().authenticated())
			// The login session is kept in the HTTP session (a JSESSIONID cookie).
			.securityContext(context -> context.securityContextRepository(securityContextRepository))
			// CSRF protection for a single-page app: the server sets an XSRF-TOKEN cookie and Angular
			// sends it back in an X-XSRF-TOKEN header on every POST/PUT/DELETE.
			.csrf(csrf -> csrf.spa())
			// Not logged in: answer 401 instead of redirecting to a login page the API doesn't have.
			.exceptionHandling(errors -> errors.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
			.logout(logout -> logout
				.logoutUrl("/api/auth/logout")
				.logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler()));
		return http.build();
	}

	/**
	 * Hashes passwords with BCrypt. The stored value is prefixed with "{bcrypt}", so a stronger
	 * algorithm can be introduced later without breaking existing passwords.
	 */
	@Bean
	PasswordEncoder passwordEncoder() {
		return PasswordEncoderFactories.createDelegatingPasswordEncoder();
	}

	/** Checks an email and password: loads the user, then compares the password with its hash. */
	@Bean
	AuthenticationManager authenticationManager(UserDetailsService userDetailsService, PasswordEncoder passwordEncoder) {
		DaoAuthenticationProvider provider = new DaoAuthenticationProvider(userDetailsService);
		provider.setPasswordEncoder(passwordEncoder);
		return new ProviderManager(provider);
	}

	@Bean
	SecurityContextRepository securityContextRepository() {
		return new HttpSessionSecurityContextRepository();
	}

}
