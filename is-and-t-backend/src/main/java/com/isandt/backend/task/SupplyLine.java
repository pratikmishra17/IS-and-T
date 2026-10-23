package com.isandt.backend.task;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** One thing to bring, as sent by the task form. */
public record SupplyLine(@NotBlank @Size(max = 100) String name, @Min(1) @Max(99) int quantity) {
}
