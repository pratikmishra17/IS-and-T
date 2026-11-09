package com.isandt.backend.inventory;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** A kind of item: Laptops, Monitors, Keyboards, Cables, ... */
@Entity
@Table(name = "categories")
public class Category {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false, unique = true)
	private String name;

	protected Category() {
	}

	Category(String name) {
		rename(name);
	}

	void rename(String name) {
		this.name = name.trim();
	}

	public Long getId() {
		return id;
	}

	public String getName() {
		return name;
	}

}
