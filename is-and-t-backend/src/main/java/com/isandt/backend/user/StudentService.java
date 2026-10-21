package com.isandt.backend.user;

import java.util.List;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.isandt.backend.auth.PasswordTokenService;
import com.isandt.backend.auth.TokenPurpose;
import com.isandt.backend.common.error.ConflictException;
import com.isandt.backend.common.error.NotFoundException;

/** What admins do with student accounts in the admin portal. */
@Service
public class StudentService {

	private final StudentRepository students;

	private final AdminRepository admins;

	private final Accounts accounts;

	private final PasswordTokenService passwordTokens;

	private final AccountEmails emails;

	private final ApplicationEventPublisher events;

	StudentService(StudentRepository students, AdminRepository admins, Accounts accounts,
			PasswordTokenService passwordTokens, AccountEmails emails, ApplicationEventPublisher events) {
		this.students = students;
		this.admins = admins;
		this.accounts = accounts;
		this.passwordTokens = passwordTokens;
		this.emails = emails;
		this.events = events;
	}

	@Transactional(readOnly = true)
	public List<AccountResponse> list() {
		return students.findAllByOrderByLastNameAscFirstNameAsc().stream().map(AccountResponse::from).toList();
	}

	/** Adds a student and emails them a link to set their password. */
	@Transactional
	public AccountResponse create(StudentDetails details, Long adminId) {
		accounts.requireEmailFree(details.email());
		requireStudentIdFree(details.studentId());

		Admin addedBy = admins.findById(adminId).orElseThrow(() -> new NotFoundException("Admin not found."));
		Student student = students.save(
				new Student(details.email(), details.firstName(), details.lastName(), details.studentId(), addedBy));
		emails.added(student, passwordTokens.issue(student, TokenPurpose.SET_PASSWORD));
		return AccountResponse.from(student);
	}

	/**
	 * Changes name, email and student ID. No save() call is needed: the student was loaded inside
	 * this transaction, so Hibernate notices the changes and writes them when it commits.
	 */
	@Transactional
	public AccountResponse update(Long id, StudentDetails details) {
		Student student = find(id);
		accounts.requireEmailFree(details.email(), student);
		if (!student.getStudentId().equals(details.studentId().trim())) {
			requireStudentIdFree(details.studentId());
		}
		student.rename(details.firstName(), details.lastName());
		student.changeEmail(details.email());
		student.changeStudentId(details.studentId());
		return AccountResponse.from(student);
	}

	@Transactional
	public void sendPasswordLink(Long id) {
		Accounts.sendPasswordLink(find(id), passwordTokens, emails);
	}

	@Transactional
	public AccountResponse disable(Long id) {
		Student student = find(id);
		if (!student.isActive()) {
			throw new ConflictException("This account is already disabled.");
		}
		student.disable();
		events.publishEvent(new StudentUnavailable(id, student.getFirstName() + "'s account was disabled"));
		return AccountResponse.from(student);
	}

	@Transactional
	public AccountResponse enable(Long id) {
		Student student = find(id);
		student.enable();
		return AccountResponse.from(student);
	}

	/** Deletes the account for good. Their unused password links go with it (ON DELETE CASCADE). */
	@Transactional
	public void remove(Long id) {
		Student student = find(id);
		events.publishEvent(new StudentUnavailable(id, student.getFirstName() + " was removed"));
		students.delete(student);
	}

	private void requireStudentIdFree(String studentId) {
		if (students.existsByStudentId(studentId.trim())) {
			throw new ConflictException("A student with this student ID already exists.");
		}
	}

	private Student find(Long id) {
		return students.findById(id).orElseThrow(() -> new NotFoundException("Student " + id + " not found."));
	}

}
