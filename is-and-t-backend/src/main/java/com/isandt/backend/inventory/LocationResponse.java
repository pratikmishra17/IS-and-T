package com.isandt.backend.inventory;

/** unitsStored: everything currently in this room, all items together. */
public record LocationResponse(Long id, String building, String room, String description, String label,
		long unitsStored) {
}
