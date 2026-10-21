package com.isandt.backend.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.isandt.backend.common.error.ConflictException;

@ExtendWith(MockitoExtension.class)
class MyAccountServiceTest {

	@Mock
	private Accounts accounts;

	@Mock
	private PasswordEncoder passwordEncoder;

	@InjectMocks
	private MyAccountService myAccount;

	private final Admin ada = new Admin("ada@example.com", "Ada", "Admin", null);

	@Test
	void changingYourPasswordNeedsTheCurrentOne() {
		ada.changePasswordHash("{bcrypt}old");
		when(accounts.find(Role.ADMIN, 1L)).thenReturn(ada);
		when(passwordEncoder.matches("wrong", "{bcrypt}old")).thenReturn(false);

		assertThatThrownBy(() -> myAccount.changePassword(Role.ADMIN, 1L, new ChangePasswordRequest("wrong", "new-password")))
			.isInstanceOf(ConflictException.class);
		assertThat(ada.getPasswordHash()).isEqualTo("{bcrypt}old");
	}

	@Test
	void theRightCurrentPasswordLetsYouChooseANewOne() {
		ada.changePasswordHash("{bcrypt}old");
		when(accounts.find(Role.ADMIN, 1L)).thenReturn(ada);
		when(passwordEncoder.matches("old-password", "{bcrypt}old")).thenReturn(true);
		when(passwordEncoder.encode("new-password")).thenReturn("{bcrypt}new");

		when(passwordEncoder.matches("new-password", "{bcrypt}old")).thenReturn(false);
		myAccount.changePassword(Role.ADMIN, 1L, new ChangePasswordRequest("old-password", "new-password"));

		assertThat(ada.getPasswordHash()).isEqualTo("{bcrypt}new");
	}

}
