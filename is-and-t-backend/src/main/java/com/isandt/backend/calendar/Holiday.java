package com.isandt.backend.calendar;

import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** One day the campus is closed. A multi-day break is several rows with the same name. */
@Entity
@Table(name = "holidays")
public class Holiday {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	/** The column is holiday_date because "date" is also an SQL type name; clearer to avoid it. */
	@Column(name = "holiday_date", nullable = false, unique = true)
	private LocalDate date;

	@Column(nullable = false)
	private String name;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private HolidaySource source;

	protected Holiday() {
	}

	Holiday(LocalDate date, String name, HolidaySource source) {
		this.date = date;
		this.name = name.trim();
		this.source = source;
	}

	public Long getId() {
		return id;
	}

	public LocalDate getDate() {
		return date;
	}

	public String getName() {
		return name;
	}

	public HolidaySource getSource() {
		return source;
	}

}
