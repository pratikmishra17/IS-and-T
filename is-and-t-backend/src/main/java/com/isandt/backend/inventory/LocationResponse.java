package com.isandt.backend.inventory;

/**
 * unitsStored: everything currently in this room, all items together. hasHistory: stock moved in or
 * out, or a task planned items from here, so it can't be deleted.
 */
public record LocationResponse(Long id, String building, String room, String description, String label,
		long unitsStored, boolean hasHistory) {
}
