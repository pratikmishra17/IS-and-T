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

/** A semester (Fall 2026, ...): its dates and how many hours a week a student may work in it. */
@Entity
@Table(name = "semesters")
public class Semester {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false, unique = true)
	private String name;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private SemesterType type;

	@Column(nullable = false)
	private LocalDate startDate;

	@Column(nullable = false)
	private LocalDate endDate;

	@Column(nullable = false)
	private int weeklyHourLimit;

	protected Semester() {
	}

	Semester(SemesterDetails details) {
		update(details);
	}

	void update(SemesterDetails details) {
		this.name = details.name().trim();
		this.type = details.type();
		this.startDate = details.startDate();
		this.endDate = details.endDate();
		this.weeklyHourLimit = details.weeklyHourLimit();
	}

	/** True if the two date ranges share at least one day. */
	boolean overlaps(LocalDate otherStart, LocalDate otherEnd) {
		return !startDate.isAfter(otherEnd) && !otherStart.isAfter(endDate);
	}

	public boolean contains(LocalDate date) {
		return !date.isBefore(startDate) && !date.isAfter(endDate);
	}

	public Long getId() {
		return id;
	}

	public String getName() {
		return name;
	}

	public SemesterType getType() {
		return type;
	}

	public LocalDate getStartDate() {
		return startDate;
	}

	public LocalDate getEndDate() {
		return endDate;
	}

	public int getWeeklyHourLimit() {
		return weeklyHourLimit;
	}

}
