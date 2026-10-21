package com.isandt.backend.settings;

import java.time.Clock;
import java.time.LocalDate;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;

/** Admin portal: settings. Admins only (/api/admin/**). */
@RestController
@RequestMapping("/api/admin/settings")
public class SettingsController {

	private final SettingsService settings;

	private final DailyDigest digest;

	private final Clock clock;

	SettingsController(SettingsService settings, DailyDigest digest, Clock clock) {
		this.settings = settings;
		this.digest = digest;
		this.clock = clock;
	}

	@GetMapping
	SettingsResponse get() {
		return settings.get();
	}

	@PutMapping
	SettingsResponse update(@Valid @RequestBody SettingsRequest request) {
		return settings.update(request);
	}

	/** Sends today's digest right now, to check what it looks like. Doesn't affect the scheduled one. */
	@PostMapping("/digest/send-now")
	Map<String, Integer> sendDigestNow() {
		return Map.of("sentTo", digest.send(LocalDate.now(clock)));
	}

}
