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

/**
 * Development only (@Profile("dev")). On every startup, makes sure the app.seed.* admin from
 * application-dev.properties exists, is active and has exactly that password, so the dev login at
 * /admin/login always works. Other admins (added in the admin portal) are left alone.
 */
@Component
@Profile("dev")
public class DevDataSeeder implements ApplicationRunner {

	private static final Logger log = LoggerFactory.getLogger(DevDataSeeder.class);

	private final AdminRepository admins;

	private final StudentRepository students;

	private final PasswordEncoder passwordEncoder;

	private final String email;

	private final String password;

	private final String firstName;

	private final String lastName;

	DevDataSeeder(AdminRepository admins, StudentRepository students, PasswordEncoder passwordEncoder,
			@Value("${app.seed.admin-email}") String email, @Value("${app.seed.admin-password}") String password,
			@Value("${app.seed.admin-first-name}") String firstName,
			@Value("${app.seed.admin-last-name}") String lastName) {
		this.admins = admins;
		this.students = students;
		this.passwordEncoder = passwordEncoder;
		this.email = Account.normalizeEmail(email);
		this.password = password;
		this.firstName = firstName;
		this.lastName = lastName;
	}

	@Override
	@Transactional
	public void run(ApplicationArguments args) {
		// One email can't be both a student and an admin; free it up for the seed admin if needed.
		students.findByEmail(email).ifPresent(student -> {
			students.delete(student);
			log.warn("Removed student account {} so it can be the dev admin.", email);
		});

		Admin admin = admins.findByEmail(email).orElseGet(() -> {
			log.info("Creating the dev admin {}.", email);
			Admin created = new Admin(email, firstName, lastName, null);
			created.setReceivesDigest(true); // only when created: afterwards it's chosen on the Settings page
			return admins.save(created);
		});
		admin.enable();
		admin.changePasswordHash(passwordEncoder.encode(password));
		log.info("Dev admin ready: log in at /admin/login as {} with app.seed.admin-password.", email);
	}

}
