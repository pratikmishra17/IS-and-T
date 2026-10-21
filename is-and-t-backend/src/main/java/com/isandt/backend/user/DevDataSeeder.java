package com.isandt.backend.user;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.isandt.backend.auth.PasswordTokenService;
import com.isandt.backend.auth.TokenPurpose;

/**
 * Development only (@Profile("dev")): makes sure a fresh database has an admin to log in with.
 * It only ever creates that account; an existing one is left exactly as it is (its password is
 * never reset). No password is stored in the code or in git:
 * <ul>
 * <li>with DEV_ADMIN_PASSWORD set, the account starts with that password and must change it at first login;</li>
 * <li>without it, a set-password link is emailed to the admin's address.</li>
 * </ul>
 */
@Component
@Profile("dev")
public class DevDataSeeder implements ApplicationRunner {

	private static final Logger log = LoggerFactory.getLogger(DevDataSeeder.class);

	private final AdminRepository admins;

	private final StudentRepository students;

	private final PasswordEncoder passwordEncoder;

	private final PasswordTokenService passwordTokens;

	private final AccountEmails emails;

	private final String email;

	private final String password;

	private final String firstName;

	private final String lastName;

	DevDataSeeder(AdminRepository admins, StudentRepository students, PasswordEncoder passwordEncoder,
			PasswordTokenService passwordTokens, AccountEmails emails, @Value("${app.seed.admin-email}") String email,
			@Value("${app.seed.admin-password:}") String password, @Value("${app.seed.admin-first-name}") String firstName,
			@Value("${app.seed.admin-last-name}") String lastName) {
		this.admins = admins;
		this.students = students;
		this.passwordEncoder = passwordEncoder;
		this.passwordTokens = passwordTokens;
		this.emails = emails;
		this.email = Account.normalizeEmail(email);
		this.password = password;
		this.firstName = firstName;
		this.lastName = lastName;
	}

	@Override
	@Transactional
	public void run(ApplicationArguments args) {
		if (admins.findByEmail(email).isPresent()) {
			return;
		}
		if (students.findByEmail(email).isPresent()) {
			log.warn("Not creating the dev admin: {} is already a student account.", email);
			return;
		}

		Admin admin = new Admin(email, firstName, lastName, null);
		admin.setReceivesDigest(true);
		admins.save(admin);
		if (password.isBlank()) {
			emails.added(admin, passwordTokens.issue(admin, TokenPurpose.SET_PASSWORD));
			log.info("Created the dev admin {}; a set-password link was emailed to it.", email);
		}
		else {
			admin.changePasswordHash(passwordEncoder.encode(password));
			admin.requirePasswordChange();
			log.info("Created the dev admin {} with DEV_ADMIN_PASSWORD; it must be changed at first login.", email);
		}
	}

}
