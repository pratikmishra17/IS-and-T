package com.isandt.backend.auth;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;

import com.isandt.backend.common.error.TooManyAttemptsException;

class LoginThrottleTest {

	/** A clock the test can move forward. */
	private static final class MovableClock extends Clock {

		private Instant now = Instant.parse("2026-10-21T15:00:00Z");

		void advance(Duration duration) {
			now = now.plus(duration);
		}

		@Override
		public Instant instant() {
			return now;
		}

		@Override
		public ZoneId getZone() {
			return ZoneOffset.UTC;
		}

		@Override
		public Clock withZone(ZoneId zone) {
			return this;
		}

	}

	private final MovableClock clock = new MovableClock();

	private final LoginThrottle throttle = new LoginThrottle(clock);

	private void fail(int times) {
		for (int i = 0; i < times; i++) {
			throttle.check(LoginThrottle.LOGIN_PER_ACCOUNT, "sam@csuohio.edu");
			throttle.record(LoginThrottle.LOGIN_PER_ACCOUNT, "sam@csuohio.edu");
		}
	}

	@Test
	void allowsFiveAttemptsThenRefusesForFifteenMinutes() {
		fail(5);
		assertThatThrownBy(() -> throttle.check(LoginThrottle.LOGIN_PER_ACCOUNT, "sam@csuohio.edu"))
			.isInstanceOf(TooManyAttemptsException.class)
			.hasMessage("Too many attempts. Please wait 15 minutes and try again.");

		clock.advance(Duration.ofMinutes(14));
		assertThatThrownBy(() -> throttle.check(LoginThrottle.LOGIN_PER_ACCOUNT, "sam@csuohio.edu"))
			.hasMessage("Too many attempts. Please wait 1 minute and try again.");

		clock.advance(Duration.ofMinutes(1).plusSeconds(1));
		assertThatCode(() -> throttle.check(LoginThrottle.LOGIN_PER_ACCOUNT, "sam@csuohio.edu")).doesNotThrowAnyException();
	}

	@Test
	void aSuccessfulLoginClearsTheCount() {
		fail(4);
		throttle.reset(LoginThrottle.LOGIN_PER_ACCOUNT, "sam@csuohio.edu");
		fail(4);
		assertThatCode(() -> throttle.check(LoginThrottle.LOGIN_PER_ACCOUNT, "sam@csuohio.edu")).doesNotThrowAnyException();
	}

	@Test
	void eachAccountAndLimitIsCountedSeparately() {
		fail(5);
		assertThatCode(() -> throttle.check(LoginThrottle.LOGIN_PER_ACCOUNT, "alex@csuohio.edu")).doesNotThrowAnyException();
		assertThatCode(() -> throttle.check(LoginThrottle.RESET_PER_ACCOUNT, "sam@csuohio.edu")).doesNotThrowAnyException();
	}

}
