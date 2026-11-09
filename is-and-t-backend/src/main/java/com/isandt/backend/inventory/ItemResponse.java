package com.isandt.backend.inventory;

import java.util.List;
import java.util.Map;

/**
 * An item with its stock: on hand per room and in total. reserved is what planned deployments have
 * set aside; available = onHand - reserved. lowStock means the
 * total on hand is at or below the item's threshold. hasHistory: stock moved or a task used it, so it
 * can only be archived, not deleted.
 */
public record ItemResponse(Long id, Long categoryId, String categoryName, String name, String manufacturer,
		String model, TrackingType trackingType, int lowStockThreshold, Map<String, String> attributes,
		boolean archived, int onHand, int reserved, int available, boolean lowStock, List<StockAtLocation> stock,
		boolean hasHistory) {

	public record StockAtLocation(Long locationId, String label, int quantity) {
	}

	static ItemResponse from(Item item, List<StockLevel> levels, int reserved, boolean hasHistory) {
		int onHand = levels.stream().mapToInt(StockLevel::getQuantityOnHand).sum();
		List<StockAtLocation> stock = levels.stream()
				.filter(level -> level.getQuantityOnHand() > 0)
				.map(level -> new StockAtLocation(level.getLocation().getId(), level.getLocation().label(),
						level.getQuantityOnHand()))
				.toList();
		return new ItemResponse(item.getId(), item.getCategory().getId(), item.getCategory().getName(), item.getName(),
				item.getManufacturer(), item.getModel(), item.getTrackingType(), item.getLowStockThreshold(),
				item.getAttributes(), item.isArchived(), onHand, reserved, onHand - reserved,
				onHand <= item.getLowStockThreshold(), stock, hasHistory);
	}

}
