package com.isandt.backend.inventory;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/** How many of one item are in one room. Only StockService changes it, always with a transaction row. */
@Entity
@Table(name = "stock_levels")
public class StockLevel {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "item_id")
	private Item item;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "location_id")
	private StorageLocation location;

	@Column(nullable = false)
	private int quantityOnHand;

	protected StockLevel() {
	}

	StockLevel(Item item, StorageLocation location) {
		this.item = item;
		this.location = location;
	}

	void change(int delta) {
		this.quantityOnHand += delta;
	}

	public Item getItem() {
		return item;
	}

	public StorageLocation getLocation() {
		return location;
	}

	public int getQuantityOnHand() {
		return quantityOnHand;
	}

}
