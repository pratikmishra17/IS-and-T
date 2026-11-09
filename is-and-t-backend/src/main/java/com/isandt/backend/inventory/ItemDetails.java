package com.isandt.backend.inventory;

import java.util.Map;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * An item as an admin types it, when adding or editing. When adding, startingQuantity and
 * startingLocationId optionally put its first stock in a room in the same step (editing ignores
 * them; stock is then changed with a StockAdjustment).
 */
public record ItemDetails(
		@NotNull Long categoryId,
		@NotBlank @Size(max = 200) String name,
		@Size(max = 100) String manufacturer,
		@Size(max = 100) String model,
		@Min(0) @Max(100000) int lowStockThreshold,
		Map<String, String> attributes,
		Long startingLocationId,
		@Min(0) @Max(100000) Integer startingQuantity) {

	/** Without starting stock. */
	public ItemDetails(Long categoryId, String name, String manufacturer, String model, int lowStockThreshold,
			Map<String, String> attributes) {
		this(categoryId, name, manufacturer, model, lowStockThreshold, attributes, null, null);
	}

}
