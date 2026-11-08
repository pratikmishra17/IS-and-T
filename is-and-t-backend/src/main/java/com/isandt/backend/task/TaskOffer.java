package com.isandt.backend.task;

import java.time.Instant;

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

/** "I can do this": a student offering to take a task someone else has. An admin accepts or declines. */
@Entity
@Table(name = "task_offers")
public class TaskOffer {

	public enum Status {
		PENDING, ACCEPTED, DECLINED, WITHDRAWN,
		/** No longer needed: the task finished or was cancelled, or the student got it another way. */
		CLOSED
	}

	/** Waiting, but nobody needs to answer any more (see CLOSED). */
	boolean isStale() {
		return status == Status.PENDING && (!task.getStatus().isOpen()
				|| task.getAssignee() != null && task.getAssignee().getId().equals(student.getId()));
	}

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "task_id")
	private Task task;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "student_id")
	private Student student;

	private String note;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private Status status = Status.PENDING;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "reviewed_by_id")
	private Admin reviewedBy;

	@Column(name = "reviewed_at")
	private Instant reviewedAt;

	protected TaskOffer() {
	}

	TaskOffer(Task task, Student student, String note, Instant now) {
		this.task = task;
		this.student = student;
		this.note = note == null || note.isBlank() ? null : note.strip();
		this.createdAt = now;
	}

	void close(Status outcome, Admin admin, Instant now) {
		if (status != Status.PENDING) {
			throw new ConflictException("This offer has already been " + status.name().toLowerCase() + ".");
		}
		this.status = outcome;
		this.reviewedBy = admin;
		this.reviewedAt = now;
	}

	public Long getId() {
		return id;
	}

	public Task getTask() {
		return task;
	}

	public Student getStudent() {
		return student;
	}

	public String getNote() {
		return note;
	}

	public Status getStatus() {
		return status;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public Instant getReviewedAt() {
		return reviewedAt;
	}

}
