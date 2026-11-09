package com.isandt.backend.inventory;

/** Items a completed deployment still owes the employee, and whether they're in stock again. */
public record BackorderResponse(Long plannedItemId, Long taskId, Long itemId, String itemName, Long locationId,
		String locationLabel, int missing, int availableNow) {
}
