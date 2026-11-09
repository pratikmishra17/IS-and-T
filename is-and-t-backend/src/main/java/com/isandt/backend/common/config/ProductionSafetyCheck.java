package com.isandt.backend.common.config;

import java.util.ArrayList;
import java.util.List;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Production only: refuses to start with settings that are fine on a laptop but unsafe on a server,
 * instead of starting and quietly running insecurely.
 */
@Component
@Profile("prod")
class ProductionSafetyCheck implements InitializingBean {

	private final String frontendUrl;

	private final boolean secureCookies;

	private final String mailPassword;

	private final String databaseUser;

	ProductionSafetyCheck(@Value("${app.frontend-url:}") String frontendUrl,
			@Value("${app.security.secure-cookies}") boolean secureCookies,
			@Value("${spring.mail.password:}") String mailPassword,
			@Value("${spring.datasource.username}") String databaseUser) {
		this.frontendUrl = frontendUrl;
		this.secureCookies = secureCookies;
		this.mailPassword = mailPassword;
		this.databaseUser = databaseUser;
	}

	@Override
	public void afterPropertiesSet() {
		List<String> problems = new ArrayList<>();
		if (!frontendUrl.startsWith("https://")) {
			problems.add("FRONTEND_URL must be an https:// address");
		}
		if (!secureCookies) {
			problems.add("cookies must be Secure (app.security.secure-cookies=true)");
		}
		if (mailPassword.isBlank()) {
			problems.add("email isn't configured (GMAIL_APP_PASSWORD); emails would only be printed to the log");
		}
		if (databaseUser.equals("postgres")) {
			problems.add("the app connects to the database as the superuser 'postgres'; use the limited app user (docs/db-roles.sql)");
		}
		if (!problems.isEmpty()) {
			throw new IllegalStateException("Unsafe production settings: " + String.join("; ", problems) + ".");
		}
	}

}
