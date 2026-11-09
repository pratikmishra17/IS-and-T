package com.isandt.backend.auth;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.isandt.backend.common.error.ConflictException;
import com.isandt.backend.user.Student;


@ExtendWith(MockitoExtension.class)
class PasswordTokenServiceTest {

	@Mock
	private PasswordTokenRepository tokens;

	@InjectMocks
	private PasswordTokenService passwordTokenService;

	@Test
	void unknownTokensAreRejected() {
		when(tokens.findByTokenHash(PasswordTokenService.hash("made-up"))).thenReturn(Optional.empty());

		assertThatThrownBy(() -> passwordTokenService.redeem("made-up")).isInstanceOf(ConflictException.class);
	}

	@Test
	void expiredTokensAreRejected() {
		Student user = new Student("sam@example.com", "Sam", "Student", "2001", null);
		PasswordToken expired = new PasswordToken(user, PasswordTokenService.hash("old"), TokenPurpose.SET_PASSWORD,
				Instant.now().minusSeconds(60));
		when(tokens.findByTokenHash(PasswordTokenService.hash("old"))).thenReturn(Optional.of(expired));

		assertThatThrownBy(() -> passwordTokenService.redeem("old")).isInstanceOf(ConflictException.class);
	}

}
