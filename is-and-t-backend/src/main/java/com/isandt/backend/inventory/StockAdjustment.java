package com.isandt.backend.inventory;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** One change to one item's stock in one room; a MOVE also names the room it goes to (toLocationId). */
public record StockAdjustment(
		@NotNull Long itemId,
		@NotNull Long locationId,
		@NotNull AdjustmentType type,
		@Min(0) @Max(100000) int quantity,
		@Size(max = 500) String note,
		Long toLocationId) {

	public StockAdjustment(Long itemId, Long locationId, AdjustmentType type, int quantity, String note) {
		this(itemId, locationId, type, quantity, note, null);
	}

}
