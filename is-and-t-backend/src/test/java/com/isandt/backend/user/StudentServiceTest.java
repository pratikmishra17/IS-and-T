package com.isandt.backend.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.isandt.backend.auth.PasswordTokenService;
import com.isandt.backend.auth.TokenPurpose;
import com.isandt.backend.common.error.ConflictException;

@ExtendWith(MockitoExtension.class)
class StudentServiceTest {

	@Mock
	private StudentRepository students;

	@Mock
	private AdminRepository admins;

	@Mock
	private Accounts accounts;

	@Mock
	private PasswordTokenService passwordTokens;

	@Mock
	private AccountEmails emails;

	@Mock
	private org.springframework.context.ApplicationEventPublisher events;

	@InjectMocks
	private StudentService studentService;

	private final Admin admin = new Admin("admin@example.com", "Ada", "Admin", null);

	private final StudentDetails sam = new StudentDetails("Sam", "Student", " Sam@Example.com ", "2001");

	@Test
	void addingAStudentCreatesTheAccountWithoutAPasswordAndEmailsThemALink() {
		when(students.existsByStudentId("2001")).thenReturn(false);
		when(admins.findById(1L)).thenReturn(Optional.of(admin));
		when(students.save(any(Student.class))).thenAnswer(call -> call.getArgument(0));
		when(passwordTokens.issue(any(Student.class), any(TokenPurpose.class))).thenReturn("raw-token");

		AccountResponse response = studentService.create(sam, 1L);

		assertThat(response.email()).isEqualTo("sam@example.com");
		assertThat(response.role()).isEqualTo(Role.STUDENT);
		assertThat(response.studentId()).isEqualTo("2001");
		assertThat(response.passwordSet()).isFalse();
		verify(emails).added(any(Student.class), any(String.class));
	}

	@Test
	void anEmailUsedByAStudentOrAnAdminCantBeAddedAgain() {
		doThrow(new ConflictException("taken")).when(accounts).requireEmailFree(" Sam@Example.com ");

		assertThatThrownBy(() -> studentService.create(sam, 1L)).isInstanceOf(ConflictException.class);
		verify(students, never()).save(any());
		verifyNoInteractions(emails);
	}

	@Test
	void editingCanKeepTheSameEmailAndStudentId() {
		Student existing = new Student("sam@example.com", "Sam", "Student", "2001", admin);
		when(students.findById(2L)).thenReturn(Optional.of(existing));

		AccountResponse response = studentService.update(2L,
				new StudentDetails("Samuel", "Student", "sam@example.com", "2001"));

		assertThat(response.firstName()).isEqualTo("Samuel");
		verify(accounts).requireEmailFree("sam@example.com", existing);
		verify(students, never()).existsByStudentId(any());
	}

	@Test
	void editingToAnotherStudentsIdIsRefused() {
		Student existing = new Student("sam@example.com", "Sam", "Student", "MISSING-2", admin);
		when(students.findById(2L)).thenReturn(Optional.of(existing));
		when(students.existsByStudentId("2001")).thenReturn(true);

		assertThatThrownBy(() -> studentService.update(2L, new StudentDetails("Sam", "Student", "sam@example.com", "2001")))
			.isInstanceOf(ConflictException.class);
		assertThat(existing.getStudentId()).isEqualTo("MISSING-2");
	}

	@Test
	void resendingSendsTheAddedEmailToSomeoneWithoutAPassword() {
		Student existing = new Student("sam@example.com", "Sam", "Student", "2001", admin);
		when(students.findById(2L)).thenReturn(Optional.of(existing));
		when(passwordTokens.issue(existing, TokenPurpose.SET_PASSWORD)).thenReturn("raw-token");

		studentService.sendPasswordLink(2L);

		verify(emails).added(existing, "raw-token");
	}

	@Test
	void studentIdsAreUnique() {
		when(students.existsByStudentId("2001")).thenReturn(true);

		assertThatThrownBy(() -> studentService.create(sam, 1L)).isInstanceOf(ConflictException.class);
		verify(students, never()).save(any());
	}

}
