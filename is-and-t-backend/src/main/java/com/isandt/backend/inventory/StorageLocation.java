package com.isandt.backend.inventory;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** A room where stock is kept, e.g. building "Rhodes Tower", room "1408". */
@Entity
@Table(name = "storage_locations")
public class StorageLocation {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false)
	private String building;

	@Column(nullable = false)
	private String room;

	private String description;

	protected StorageLocation() {
	}

	StorageLocation(LocationRequest request) {
		update(request);
	}

	void update(LocationRequest request) {
		this.building = request.building().trim();
		this.room = request.room().trim();
		this.description = request.description() == null || request.description().isBlank() ? null
				: request.description().trim();
	}

	/** How the location is shown everywhere: "Rhodes Tower 1408". */
	public String label() {
		return building + " " + room;
	}

	public Long getId() {
		return id;
	}

	public String getBuilding() {
		return building;
	}

	public String getRoom() {
		return room;
	}

	public String getDescription() {
		return description;
	}

}
