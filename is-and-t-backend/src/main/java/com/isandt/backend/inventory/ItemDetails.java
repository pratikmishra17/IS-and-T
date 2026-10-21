package com.isandt.backend.inventory;

import java.util.Map;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** An item as an admin types it, when adding or editing. Stock is changed separately (StockAdjustment). */
public record ItemDetails(
		@NotNull Long categoryId,
		@NotBlank @Size(max = 200) String name,
		@Size(max = 100) String manufacturer,
		@Size(max = 100) String model,
		@Min(0) @Max(100000) int lowStockThreshold,
		Map<String, String> attributes) {
}
