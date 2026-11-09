package com.isandt.backend.schedule;

import java.time.Instant;

import com.isandt.backend.calendar.Semester;
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

/** A student asking for their preferred hours to be approved as shifts for a semester. */
@Entity
@Table(name = "schedule_requests")
public class ScheduleRequest {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "student_id")
	private Student student;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "semester_id")
	private Semester semester;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private ScheduleRequestStatus status;

	@Column(nullable = false)
	private Instant submittedAt;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "reviewed_by_id")
	private Admin reviewedBy;

	private Instant reviewedAt;

	protected ScheduleRequest() {
	}

	ScheduleRequest(Student student, Semester semester) {
		this.student = student;
		this.semester = semester;
		this.status = ScheduleRequestStatus.SUBMITTED;
		this.submittedAt = Instant.now();
	}

	/** Submitting again while still waiting just moves the request's time forward. */
	void resubmit() {
		this.submittedAt = Instant.now();
	}

	void approve(Admin admin, boolean changed) {
		this.status = changed ? ScheduleRequestStatus.APPROVED_WITH_CHANGES : ScheduleRequestStatus.APPROVED;
		this.reviewedBy = admin;
		this.reviewedAt = Instant.now();
	}

	public Long getId() {
		return id;
	}

	public Student getStudent() {
		return student;
	}

	public Semester getSemester() {
		return semester;
	}

	public ScheduleRequestStatus getStatus() {
		return status;
	}

	public Instant getSubmittedAt() {
		return submittedAt;
	}

	public Instant getReviewedAt() {
		return reviewedAt;
	}

}
