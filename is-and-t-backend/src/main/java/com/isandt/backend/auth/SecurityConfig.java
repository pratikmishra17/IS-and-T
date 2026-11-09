package com.isandt.backend.auth;

import java.time.Clock;

import org.springframework.beans.factory.annotation.Value;
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
import org.springframework.security.web.authentication.logout.LogoutFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import org.springframework.security.web.header.writers.StaticHeadersWriter;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;

import com.isandt.backend.activity.ActivityLog;
import com.isandt.backend.user.Accounts;

@Configuration
public class SecurityConfig {

	/**
	 * Every request passes through this chain of filters before reaching a controller.
	 * Rules are checked top to bottom; the first match wins.
	 */
	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http, SecurityContextRepository securityContextRepository,
			Accounts accounts, SessionPolicy policy, Clock clock, ActivityLog activity,
			@Value("${app.security.secure-cookies:false}") boolean secureCookies) {
		// The CSRF cookie: readable by Angular (that's how it sends the token back), SameSite=Lax so other
		// sites' requests don't carry it, and Secure (HTTPS only) in production.
		CookieCsrfTokenRepository csrfTokens = CookieCsrfTokenRepository.withHttpOnlyFalse();
		csrfTokens.setCookieCustomizer(cookie -> cookie.sameSite("Lax").secure(secureCookies));

		http
			.authorizeHttpRequests(auth -> auth
				.requestMatchers(HttpMethod.POST, "/api/auth/login", "/api/auth/set-password",
						"/api/auth/forgot-password", "/api/auth/password-link/check", "/api/auth/password-link/renew").permitAll()
				.requestMatchers(HttpMethod.GET, "/api/auth/me").permitAll()
				// Calendar apps fetch feeds without logging in; the secret token in the URL protects them.
				.requestMatchers(HttpMethod.GET, "/api/calendar/*").permitAll()
				.requestMatchers("/error").permitAll()
				.requestMatchers("/api/admin/**").hasRole("ADMIN")
				.requestMatchers("/api/me/**").hasRole("STUDENT")
				.anyRequest().authenticated())
			// The login session is kept in the HTTP session (a JSESSIONID cookie).
			.securityContext(context -> context.securityContextRepository(securityContextRepository))
			// CSRF protection for a single-page app: the server sets an XSRF-TOKEN cookie and Angular
			// sends it back in an X-XSRF-TOKEN header on every POST/PUT/DELETE.
			.csrf(csrf -> csrf.spa().csrfTokenRepository(csrfTokens))
			// Ends sessions that are too old, disabled or revoked, and enforces "choose a new password first".
			.addFilterAfter(new SessionGuardFilter(accounts, policy, clock), LogoutFilter.class)
			// Browser protections on every API response. The API only ever returns data, so it may load
			// nothing, run nothing and never be shown inside another page.
			.headers(headers -> headers
				.contentSecurityPolicy(csp -> csp.policyDirectives("default-src 'none'; frame-ancestors 'none'"))
				.frameOptions(frame -> frame.deny())
				.referrerPolicy(referrer -> referrer.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER))
				.addHeaderWriter(new StaticHeadersWriter("Permissions-Policy", "camera=(), microphone=(), geolocation=()")))
			// Not logged in: answer 401 instead of redirecting to a login page the API doesn't have.
			.exceptionHandling(errors -> errors.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
			.logout(logout -> logout
				.logoutUrl("/api/auth/logout")
				// Logging out never reaches a controller, so it's written to the activity log here
				.addLogoutHandler((request, response, authentication) -> activity.loggedOut(request, authentication))
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
