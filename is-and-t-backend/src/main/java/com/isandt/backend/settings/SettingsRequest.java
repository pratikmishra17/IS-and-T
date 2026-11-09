package com.isandt.backend.settings;

import java.time.LocalTime;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonFormat;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record SettingsRequest(
		@NotNull @JsonFormat(pattern = "HH:mm") LocalTime digestTime,
		@Min(5) @Max(600) int defaultTaskDuration,
		@NotNull List<Long> digestRecipientIds) {
}
