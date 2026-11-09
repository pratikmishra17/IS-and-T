package com.isandt.backend.inventory;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

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

/** A model of something kept in stock, e.g. "Dell P2422H" in Monitors. Counted per storage location. */
@Entity
@Table(name = "items")
public class Item {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "category_id")
	private Category category;

	@Column(nullable = false)
	private String name;

	private String manufacturer;

	private String model;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private TrackingType trackingType;

	/** At or below this many in total (all rooms together), the item counts as low stock. */
	@Column(nullable = false)
	private int lowStockThreshold;

	/**
	 * Optional extra fields ("Size": "24 in", "Connector": "USB-C"). Stored in one JSONB column, so
	 * new kinds of details need no new database columns. @JdbcTypeCode tells Hibernate it's JSON.
	 */
	@JdbcTypeCode(SqlTypes.JSON)
	@Column(nullable = false)
	private Map<String, String> attributes = new LinkedHashMap<>();

	/** Archived items are hidden from the lists but keep their history. */
	private boolean archived;

	@Column(nullable = false)
	private Instant createdAt;

	protected Item() {
	}

	Item(Category category, ItemDetails details) {
		this.trackingType = TrackingType.COUNT;
		this.createdAt = Instant.now();
		update(category, details);
	}

	void update(Category category, ItemDetails details) {
		this.category = category;
		this.name = details.name().trim();
		this.manufacturer = blankToNull(details.manufacturer());
		this.model = blankToNull(details.model());
		this.lowStockThreshold = details.lowStockThreshold();
		this.attributes = new LinkedHashMap<>();
		if (details.attributes() != null) {
			details.attributes().forEach((key, value) -> {
				if (key != null && !key.isBlank() && value != null && !value.isBlank()) {
					this.attributes.put(key.trim(), value.trim());
				}
			});
		}
	}

	void archive() {
		this.archived = true;
	}

	void restore() {
		this.archived = false;
	}

	private static String blankToNull(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}

	public Long getId() {
		return id;
	}

	public Category getCategory() {
		return category;
	}

	public String getName() {
		return name;
	}

	public String getManufacturer() {
		return manufacturer;
	}

	public String getModel() {
		return model;
	}

	public TrackingType getTrackingType() {
		return trackingType;
	}

	public int getLowStockThreshold() {
		return lowStockThreshold;
	}

	public Map<String, String> getAttributes() {
		return attributes;
	}

	public boolean isArchived() {
		return archived;
	}

}
