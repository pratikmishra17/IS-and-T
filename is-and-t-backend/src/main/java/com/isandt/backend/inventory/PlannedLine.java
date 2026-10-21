package com.isandt.backend.inventory;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/** One line of a task's planned items, as an admin enters it: this many of this item, from this room. */
public record PlannedLine(@NotNull Long itemId, @NotNull Long locationId, @Min(1) @Max(1000) int quantity) {
}
