package com.isandt.backend.settings;

import java.time.LocalTime;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonFormat;

public record SettingsResponse(@JsonFormat(pattern = "HH:mm") LocalTime digestTime, int defaultTaskDuration,
		List<Recipient> admins) {

	/** An admin, and whether they get the daily digest. */
	public record Recipient(Long id, String name, String email, boolean active, boolean receivesDigest) {
	}

}
