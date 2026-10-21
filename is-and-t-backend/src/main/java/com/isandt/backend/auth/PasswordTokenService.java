package com.isandt.backend.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.isandt.backend.common.error.ConflictException;
import com.isandt.backend.user.Account;

/**
 * Issues and redeems the single-use tokens in set-password and reset-password links.
 * The raw token only ever exists in the email; the database stores its SHA-256 hash,
 * so someone who reads the database can't use the links.
 */
@Service
public class PasswordTokenService {

	private static final Duration SET_PASSWORD_VALIDITY = Duration.ofHours(48);

	private static final Duration RESET_PASSWORD_VALIDITY = Duration.ofHours(1);

	private final SecureRandom random = new SecureRandom();

	private final PasswordTokenRepository tokens;

	PasswordTokenService(PasswordTokenRepository tokens) {
		this.tokens = tokens;
	}

	/** Creates a token for the account and returns the raw value to put in the email link. */
	@Transactional
	public String issue(Account account, TokenPurpose purpose) {
		byte[] bytes = new byte[32];
		random.nextBytes(bytes);
		String rawToken = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);

		Duration validity = purpose == TokenPurpose.SET_PASSWORD ? SET_PASSWORD_VALIDITY : RESET_PASSWORD_VALIDITY;
		tokens.save(new PasswordToken(account, hash(rawToken), purpose, Instant.now().plus(validity)));
		return rawToken;
	}

	/**
	 * Uses up the token and returns its account. Every other unused link for that account stops
	 * working too, so an older email can't be used after the password has been set.
	 */
	@Transactional
	public Account redeem(String rawToken) {
		PasswordToken token = tokens.findByTokenHash(hash(rawToken))
				.filter(candidate -> candidate.isUsable(Instant.now()))
				.orElseThrow(() -> new ConflictException("This link is invalid or has expired."));

		Account account = token.getAccount();
		tokens.findUnusedFor(account).forEach(PasswordToken::markUsed);
		return account;
	}

	static String hash(String rawToken) {
		try {
			byte[] digest = MessageDigest.getInstance("SHA-256").digest(rawToken.getBytes(StandardCharsets.UTF_8));
			return HexFormat.of().formatHex(digest);
		}
		catch (NoSuchAlgorithmException ex) {
			throw new IllegalStateException("SHA-256 is always available in Java", ex);
		}
	}

}
