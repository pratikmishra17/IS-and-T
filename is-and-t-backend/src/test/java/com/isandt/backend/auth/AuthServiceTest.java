package com.isandt.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.isandt.backend.user.AccountEmails;
import com.isandt.backend.user.Accounts;
import com.isandt.backend.user.Admin;
import com.isandt.backend.user.Student;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

	@Mock
	private Accounts accounts;

	@Mock
	private PasswordTokenService passwordTokens;

	@Mock
	private PasswordEncoder passwordEncoder;

	@Mock
	private AccountEmails emails;

	@InjectMocks
	private AuthService authService;

	private final Student sam = new Student("sam@example.com", "Sam", "Student", "2001", null);

	@Test
	void settingAPasswordStoresOnlyTheHash() {
		when(passwordTokens.redeem("raw-token")).thenReturn(sam);
		when(passwordEncoder.encode("correct horse")).thenReturn("{bcrypt}hashed");

		authService.setPassword(new SetPasswordRequest("raw-token", "correct horse"));

		assertThat(sam.getPasswordHash()).isEqualTo("{bcrypt}hashed");
	}

	@Test
	void forgotPasswordWorksForAdminsToo() {
		Admin ada = new Admin("ada@example.com", "Ada", "Admin", null);
		when(accounts.findByEmail("ada@example.com")).thenReturn(Optional.of(ada));
		when(passwordTokens.issue(ada, TokenPurpose.RESET_PASSWORD)).thenReturn("raw-token");

		authService.requestPasswordReset(new ForgotPasswordRequest("ada@example.com"));

		verify(emails).passwordReset(ada, "raw-token");
	}

	@Test
	void forgotPasswordSendsNothingForAnEmailNobodyAdded() {
		when(accounts.findByEmail("stranger@example.com")).thenReturn(Optional.empty());

		authService.requestPasswordReset(new ForgotPasswordRequest("stranger@example.com"));

		verifyNoInteractions(emails, passwordTokens);
	}

	@Test
	void disabledAccountsCantResetTheirPassword() {
		sam.disable();
		when(accounts.findByEmail("sam@example.com")).thenReturn(Optional.of(sam));

		authService.requestPasswordReset(new ForgotPasswordRequest("sam@example.com"));

		verifyNoInteractions(emails, passwordTokens);
	}

}
