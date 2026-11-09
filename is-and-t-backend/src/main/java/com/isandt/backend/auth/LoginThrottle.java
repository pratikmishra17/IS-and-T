package com.isandt.backend.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

import com.isandt.backend.common.error.TooManyAttemptsException;

/**
 * Slows down password guessing: remembers recent attempts per key ("login:email:sam@...",
 * "login:ip:10.0.0.5") and refuses more once a limit is reached within a time window.
 * <p>
 * Kept in memory, so a restart forgets it; fine for one server. With several servers it would move to
 * the database or a cache shared between them.
 */
@Component
class LoginThrottle {

	/** One limit: at most {@code max} attempts per {@code window}. */
	record Limit(String name, int max, Duration window) {
	}

	static final Limit LOGIN_PER_ACCOUNT = new Limit("login:email", 5, Duration.ofMinutes(15));

	static final Limit LOGIN_PER_ADDRESS = new Limit("login:ip", 20, Duration.ofMinutes(15));

	static final Limit RESET_PER_ACCOUNT = new Limit("reset:email", 3, Duration.ofHours(1));

	static final Limit RESET_PER_ADDRESS = new Limit("reset:ip", 5, Duration.ofMinutes(15));

	static final Limit SET_PASSWORD_PER_ADDRESS = new Limit("set-password:ip", 10, Duration.ofMinutes(15));

	private final Map<String, Deque<Instant>> attempts = new ConcurrentHashMap<>();

	private final Clock clock;

	LoginThrottle(Clock clock) {
		this.clock = clock;
	}

	/** Throws if the limit is already reached for this value (an email or an address). */
	void check(Limit limit, String value) {
		Deque<Instant> recent = recent(limit, value);
		synchronized (recent) {
			if (recent.size() >= limit.max()) {
				long secondsLeft = Duration.between(Instant.now(clock), recent.peekFirst().plus(limit.window())).toSeconds();
				long minutes = Math.max(1, (secondsLeft + 59) / 60); // rounded up: "1 minute" until it's over
				throw new TooManyAttemptsException("Too many attempts. Please wait " + minutes + " minute"
						+ (minutes == 1 ? "" : "s") + " and try again.");
			}
		}
	}

	void record(Limit limit, String value) {
		Deque<Instant> recent = recent(limit, value);
		synchronized (recent) {
			recent.addLast(Instant.now(clock));
		}
	}

	void reset(Limit limit, String value) {
		attempts.remove(limit.name() + ":" + value);
	}

	/** The attempts for this key still inside the window (older ones are dropped). */
	private Deque<Instant> recent(Limit limit, String value) {
		Deque<Instant> recent = attempts.computeIfAbsent(limit.name() + ":" + value, key -> new ArrayDeque<>());
		Instant cutoff = Instant.now(clock).minus(limit.window());
		synchronized (recent) {
			while (!recent.isEmpty() && recent.peekFirst().isBefore(cutoff)) {
				recent.pollFirst();
			}
		}
		return recent;
	}

}
