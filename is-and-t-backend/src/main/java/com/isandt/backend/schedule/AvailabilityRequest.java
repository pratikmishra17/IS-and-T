package com.isandt.backend.schedule;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** A student saving their class times and preferred hours for a semester. Replaces what was there. */
public record AvailabilityRequest(
		@NotNull @Size(max = 50) List<@Valid TimeBlock> classes,
		@NotNull @Size(max = 30) List<@Valid TimeBlock> preferred) {
}
