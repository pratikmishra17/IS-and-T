package com.isandt.backend.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
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
class AdminServiceTest {

	@Mock
	private AdminRepository admins;

	@Mock
	private Accounts accounts;

	@Mock
	private PasswordTokenService passwordTokens;

	@Mock
	private AccountEmails emails;

	@InjectMocks
	private AdminService adminService;

	private final Admin ada = new Admin("ada@example.com", "Ada", "Admin", null);

	private final Admin bob = new Admin("bob@example.com", "Bob", "Boss", ada);

	@Test
	void adminsCanAddOtherAdmins() {
		when(admins.findById(1L)).thenReturn(Optional.of(ada));
		when(admins.save(any(Admin.class))).thenAnswer(call -> call.getArgument(0));
		when(passwordTokens.issue(any(Admin.class), any(TokenPurpose.class))).thenReturn("raw-token");

		AccountResponse response = adminService.create(new AdminDetails("Cara", "Chief", "cara@example.com"), 1L);

		assertThat(response.role()).isEqualTo(Role.ADMIN);
		assertThat(response.studentId()).isNull();
		verify(emails).added(any(Admin.class), any(String.class));
	}

	@Test
	void adminsCanDisableAndRemoveOtherAdmins() {
		when(admins.findById(2L)).thenReturn(Optional.of(bob));

		assertThat(adminService.disable(2L, 1L).status()).isEqualTo(AccountStatus.DISABLED);
		adminService.remove(2L, 1L);

		verify(admins).delete(bob);
	}

	@Test
	void adminsCantDisableOrRemoveThemselvesSoOneAlwaysRemains() {
		assertThatThrownBy(() -> adminService.disable(1L, 1L)).isInstanceOf(ConflictException.class);
		assertThatThrownBy(() -> adminService.remove(1L, 1L)).isInstanceOf(ConflictException.class);
		verify(admins, never()).delete(any());
	}

}
