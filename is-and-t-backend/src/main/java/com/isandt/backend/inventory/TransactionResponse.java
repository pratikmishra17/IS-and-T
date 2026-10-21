package com.isandt.backend.inventory;

import java.time.Instant;

/** One line of stock history. byName: the admin who changed it, or the student whose deployment used it. */
public record TransactionResponse(Long id, Long itemId, String itemName, String locationLabel, int delta,
		TransactionReason reason, String note, String byName, Instant occurredAt) {

	static TransactionResponse from(InventoryTransaction transaction) {
		String by = transaction.getAdmin() != null
				? transaction.getAdmin().getFirstName() + " " + transaction.getAdmin().getLastName()
				: transaction.getStudent() != null
						? transaction.getStudent().getFirstName() + " " + transaction.getStudent().getLastName() : null;
		return new TransactionResponse(transaction.getId(), transaction.getItem().getId(),
				transaction.getItem().getName(), transaction.getLocation().label(), transaction.getDelta(),
				transaction.getReason(), transaction.getNote(), by, transaction.getOccurredAt());
	}

}
