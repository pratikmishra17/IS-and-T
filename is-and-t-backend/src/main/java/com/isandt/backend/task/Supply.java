package com.isandt.backend.task;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

/**
 * Something a student should bring to a task, as typed by the admin ("Webcam", 1). Not linked to
 * the inventory: for that, a task reserves stock (PlannedItem) instead.
 * <p>
 * An @Embeddable has no id or table of its own: it's stored as rows of task_supplies that belong
 * to their task (see Task.supplies).
 */
@Embeddable
public class Supply {

	@Column(nullable = false)
	private String name;

	@Column(nullable = false)
	private int quantity;

	protected Supply() {
	}

	Supply(String name, int quantity) {
		this.name = name;
		this.quantity = quantity;
	}

	public String getName() {
		return name;
	}

	public int getQuantity() {
		return quantity;
	}

}
