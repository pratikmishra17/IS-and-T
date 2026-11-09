package com.isandt.backend.auth;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.isandt.backend.user.Account;
import com.isandt.backend.user.Admin;
import com.isandt.backend.user.Student;

interface PasswordTokenRepository extends JpaRepository<PasswordToken, Long> {

	Optional<PasswordToken> findByTokenHash(String tokenHash);

	List<PasswordToken> findByStudentAndUsedAtIsNull(Student student);

	List<PasswordToken> findByAdminAndUsedAtIsNull(Admin admin);

	/** A default method: plain Java inside the interface, choosing the right query for the account type. */
	default List<PasswordToken> findUnusedFor(Account account) {
		return account instanceof Admin admin ? findByAdminAndUsedAtIsNull(admin)
				: findByStudentAndUsedAtIsNull((Student) account);
	}

}
