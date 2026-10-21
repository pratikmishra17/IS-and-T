package com.isandt.backend.inventory;

/** A planned item as the API sends it. quantityUsed is null until the task is completed. */
public record PlannedItemResponse(Long id, Long itemId, String itemName, Long locationId, String locationLabel,
		int quantityPlanned, Integer quantityUsed, PlannedItemStatus status) {

	static PlannedItemResponse from(PlannedItem planned) {
		return new PlannedItemResponse(planned.getId(), planned.getItem().getId(), planned.getItem().getName(),
				planned.getLocation().getId(), planned.getLocation().label(), planned.getQuantityPlanned(),
				planned.getQuantityUsed(), planned.getStatus());
	}

}
