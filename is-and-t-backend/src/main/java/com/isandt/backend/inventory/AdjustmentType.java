package com.isandt.backend.inventory;

public enum AdjustmentType {
	/** Add this many (new stock arrived). */
	ADD,
	/** Take this many out. */
	REMOVE,
	/** The room now has exactly this many (after a physical count). */
	SET
}
