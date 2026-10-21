package com.isandt.backend.timeoff;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;

import com.isandt.backend.common.error.ConflictException;
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

/** A student asking for time off: a whole day (no times) or part of one (start and end). */
@Entity
@Table(name = "time_off_requests")
public class TimeOffRequest {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "student_id")
	private Student student;

	@Column(name = "off_date", nullable = false)
	private LocalDate date;

	@Column(name = "start_time")
	private LocalTime start;

	@Column(name = "end_time")
	private LocalTime end;

	private String reason;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private TimeOffStatus status;

	@Column(nullable = false)
	private Instant submittedAt;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "reviewed_by_id")
	private Admin reviewedBy;

	private Instant reviewedAt;

	private String reviewNote;

	protected TimeOffRequest() {
	}

	TimeOffRequest(Student student, TimeOffBody body) {
		this.student = student;
		this.date = body.date();
		this.start = body.start();
		this.end = body.end();
		this.reason = blankToNull(body.reason());
		this.status = TimeOffStatus.PENDING;
		this.submittedAt = Instant.now();
	}

	void approve(Admin admin, String note) {
		review(TimeOffStatus.APPROVED, admin, note);
	}

	void decline(Admin admin, String note) {
		review(TimeOffStatus.DECLINED, admin, note);
	}

	void withdraw() {
		requirePending();
		this.status = TimeOffStatus.WITHDRAWN;
	}

	boolean wholeDay() {
		return start == null;
	}

	private void review(TimeOffStatus outcome, Admin admin, String note) {
		requirePending();
		this.status = outcome;
		this.reviewedBy = admin;
		this.reviewedAt = Instant.now();
		this.reviewNote = blankToNull(note);
	}

	private void requirePending() {
		if (status != TimeOffStatus.PENDING) {
			throw new ConflictException("This request has already been " + status.name().toLowerCase() + ".");
		}
	}

	private static String blankToNull(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}

	public Long getId() {
		return id;
	}

	public Student getStudent() {
		return student;
	}

	public LocalDate getDate() {
		return date;
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

	public TimeOffStatus getStatus() {
		return status;
	}

	public Instant getSubmittedAt() {
		return submittedAt;
	}

	public Instant getReviewedAt() {
		return reviewedAt;
	}

	public String getReviewNote() {
		return reviewNote;
	}

}
