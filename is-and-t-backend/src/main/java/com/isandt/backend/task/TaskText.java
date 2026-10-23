package com.isandt.backend.task;

import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/** How a task's optional details read in emails, calendar feeds and the digest. */
public final class TaskText {

	private TaskText() {
	}

	/** "Pat Doe, pat@csuohio.edu, 216-555-0100", leaving out what's empty; null if nothing was given. */
	public static String employee(String name, String email, String phone) {
		String text = Stream.of(name, email, phone).filter(Objects::nonNull).filter(s -> !s.isBlank())
			.collect(Collectors.joining(", "));
		return text.isEmpty() ? null : text;
	}

	/** "2 × Dual Monitors, Webcam"; null if there's nothing to bring. */
	public static String supplies(List<TaskResponses.SupplyResponse> supplies) {
		String text = supplies.stream()
			.map(s -> s.quantity() == 1 ? s.name() : s.quantity() + " × " + s.name())
			.collect(Collectors.joining(", "));
		return text.isEmpty() ? null : text;
	}

}
