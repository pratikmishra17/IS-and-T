package com.isandt.backend.inventory;

public enum TransactionReason {
	/** New stock arrived. */
	RESTOCK,
	/** Taken out for another reason (broken, lent out, thrown away). */
	REMOVAL,
	/** The count was corrected after a physical count. */
	ADJUSTMENT,
	/** Used in a completed deployment (arrives with Tasks). */
	DEPLOYMENT
}
