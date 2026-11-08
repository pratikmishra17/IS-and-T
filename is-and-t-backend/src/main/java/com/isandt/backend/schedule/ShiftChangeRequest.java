package com.isandt.backend.schedule;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

import com.isandt.backend.calendar.Semester;
import com.isandt.backend.common.error.ConflictException;
import com.isandt.backend.user.Admin;
import com.isandt.backend.user.Student;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Embeddable;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;

/**
 * A student asking to change their shifts on one weekday: only on one date (ONE_DAY), or every
 * week from now on (EVERY_WEEK). The blocks are that day's new hours; none means not working.
 */
@Entity
@Table(name = "shift_change_requests")
public class ShiftChangeRequest {

	public enum Scope {
		ONE_DAY, EVERY_WEEK
	}

	public enum Status {
		PENDING, APPROVED, DECLINED, WITHDRAWN
	}

	/** One stretch of the new hours. */
	@Embeddable
	public record Block(@Column(name = "start_time", nullable = false) LocalTime start,
			@Column(name = "end_time", nullable = false) LocalTime end) {
	}

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
	private Scope scope;

	@Column(name = "change_date", nullable = false)
	private LocalDate date;

	@Enumerated(EnumType.STRING)
	@Column(name = "day_of_week", nullable = false)
	private DayOfWeek day;

	private String note;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private Status status = Status.PENDING;

	@Column(name = "submitted_at", nullable = false)
	private Instant submittedAt;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "reviewed_by_id")
	private Admin reviewedBy;

	@Column(name = "reviewed_at")
	private Instant reviewedAt;

	@Column(name = "review_note")
	private String reviewNote;

	@ElementCollection
	@CollectionTable(name = "shift_change_blocks", joinColumns = @JoinColumn(name = "request_id"))
	@OrderColumn(name = "position")
	private List<Block> blocks = new ArrayList<>();

	protected ShiftChangeRequest() {
	}

	ShiftChangeRequest(Student student, Semester semester, Scope scope, LocalDate date, List<Block> blocks, String note,
			Instant now) {
		this.student = student;
		this.semester = semester;
		this.scope = scope;
		this.date = date;
		this.day = date.getDayOfWeek();
		this.blocks = new ArrayList<>(blocks);
		this.note = note == null || note.isBlank() ? null : note.strip();
		this.submittedAt = now;
	}

	void requirePending() {
		if (status != Status.PENDING) {
			throw new ConflictException("This request has already been " + status.name().toLowerCase() + ".");
		}
	}

	void withdraw() {
		requirePending();
		status = Status.WITHDRAWN;
	}

	void review(boolean approved, Admin admin, String note, Instant now) {
		requirePending();
		status = approved ? Status.APPROVED : Status.DECLINED;
		reviewedBy = admin;
		reviewedAt = now;
		reviewNote = note == null || note.isBlank() ? null : note.strip();
	}

	List<TimeBlock> timeBlocks() {
		return blocks.stream().map(block -> new TimeBlock(day, block.start(), block.end())).toList();
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

	public Scope getScope() {
		return scope;
	}

	public LocalDate getDate() {
		return date;
	}

	public DayOfWeek getDay() {
		return day;
	}

	public String getNote() {
		return note;
	}

	public Status getStatus() {
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

	public List<Block> getBlocks() {
		return List.copyOf(blocks);
	}

}
