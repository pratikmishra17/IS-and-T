package com.isandt.backend.schedule;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;

import com.isandt.backend.user.Admin;
import com.isandt.backend.user.Student;

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

/** A one-off change for one date: a day off (CANCEL) or an extra shift (EXTRA, with times). */
@Entity
@Table(name = "shift_exceptions")
public class ShiftException {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "student_id")
	private Student student;

	@Column(name = "shift_date", nullable = false)
	private LocalDate date;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private ShiftExceptionType type;

	@Column(name = "start_time")
	private LocalTime start;

	@Column(name = "end_time")
	private LocalTime end;

	private String reason;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "created_by_id")
	private Admin createdBy;

	@Column(nullable = false)
	private Instant createdAt;

	protected ShiftException() {
	}

	ShiftException(Student student, ExceptionRequest request, Admin createdBy) {
		this.student = student;
		this.date = request.date();
		this.type = request.type();
		this.start = request.type() == ShiftExceptionType.EXTRA ? request.start() : null;
		this.end = request.type() == ShiftExceptionType.EXTRA ? request.end() : null;
		this.reason = request.reason() == null || request.reason().isBlank() ? null : request.reason().trim();
		this.createdBy = createdBy;
		this.createdAt = Instant.now();
	}

	public Long getId() {
		return id;
	}

	Long studentId() {
		return student.getId();
	}

	public LocalDate getDate() {
		return date;
	}

	public ShiftExceptionType getType() {
		return type;
	}

	public LocalTime getStart() {
		return start;
	}

	public LocalTime getEnd() {
		return end;
	}

	public String getReason() {
		return reason;
	}

}
