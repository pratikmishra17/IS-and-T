package com.isandt.backend.inventory;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/**
 * An item a task plans to use, taken from one room. It refers to its task only by id, so the
 * inventory package never depends on the task package (the task package uses inventory instead).
 */
@Entity
@Table(name = "task_items")
public class PlannedItem {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "task_id", nullable = false)
	private Long taskId;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "item_id")
	private Item item;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "location_id")
	private StorageLocation location;

	@Column(nullable = false)
	private int quantityPlanned;

	private Integer quantityUsed;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private PlannedItemStatus status;

	protected PlannedItem() {
	}

	PlannedItem(Long taskId, Item item, StorageLocation location, int quantity) {
		this.taskId = taskId;
		this.item = item;
		this.location = location;
		this.quantityPlanned = quantity;
		this.status = PlannedItemStatus.RESERVED;
	}

	void fulfil(int used) {
		this.quantityUsed = used;
		this.status = used >= quantityPlanned ? PlannedItemStatus.FULFILLED : PlannedItemStatus.BACKORDERED;
	}

	void release() {
		this.status = PlannedItemStatus.RELEASED;
	}

	public Long getId() {
		return id;
	}

	public Long getTaskId() {
		return taskId;
	}

	public Item getItem() {
		return item;
	}

	public StorageLocation getLocation() {
		return location;
	}

	public int getQuantityPlanned() {
		return quantityPlanned;
	}

	public Integer getQuantityUsed() {
		return quantityUsed;
	}

	public PlannedItemStatus getStatus() {
		return status;
	}

	/** How many are still owed after a backordered completion. */
	public int missing() {
		return status == PlannedItemStatus.BACKORDERED ? quantityPlanned - quantityUsed : 0;
	}

}
