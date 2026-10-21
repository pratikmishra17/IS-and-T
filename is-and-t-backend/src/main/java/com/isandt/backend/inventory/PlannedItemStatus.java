package com.isandt.backend.inventory;

public enum PlannedItemStatus {
	/** Set aside for an upcoming task: counts as reserved, not available. */
	RESERVED,
	/** The task was completed and used all of it; deducted from stock. */
	FULFILLED,
	/** The task was completed with less than planned; the rest is still owed to the employee. */
	BACKORDERED,
	/** No longer needed: the task was cancelled or not completed, or a follow-up took over. */
	RELEASED
}
