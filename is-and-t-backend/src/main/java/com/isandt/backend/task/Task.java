package com.isandt.backend.task;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

import org.hibernate.annotations.BatchSize;

import com.isandt.backend.common.error.ConflictException;
import com.isandt.backend.user.Admin;
import com.isandt.backend.user.Student;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
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
import jakarta.persistence.Version;

/** A deployment or fix for an employee, at a time and place, done by one student. */
@Entity
@Table(name = "tasks")
public class Task {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private TaskType type;

	@Column(nullable = false)
	private String title;

	private String description;

	/** An exact moment (stored with its time zone); shown in campus time. */
	@Column(nullable = false)
	private Instant startAt;

	@Column(nullable = false)
	private int durationMinutes;

	/** Where it happens, typed freely ("BU 201", "Rhodes Tower 1408"). */
	@Column(nullable = false)
	private String location;

	private String employeeName;

	private String employeeEmail;

	private String employeePhone;

	/**
	 * What to bring, in the order the admin typed it. @ElementCollection stores the list in its own
	 * table (task_supplies) owned by this task; @OrderColumn keeps the order. @BatchSize loads the
	 * lists of many tasks in a few queries instead of one per task.
	 */
	@ElementCollection
	@CollectionTable(name = "task_supplies", joinColumns = @JoinColumn(name = "task_id"))
	@OrderColumn(name = "position")
	@BatchSize(size = 50)
	private List<Supply> supplies = new ArrayList<>();

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private TaskStatus status;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "assignee_id")
	private Student assignee;

	private boolean claimedOffShift;

	private String outcomeNotes;

	private Instant finishedAt;

	@Column(name = "parent_task_id")
	private Long parentTaskId;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "created_by_id")
	private Admin createdBy;

	@Column(nullable = false)
	private Instant createdAt;

	/**
	 * Optimistic locking: Hibernate adds "WHERE version = ?" to every UPDATE and increments it. If two
	 * students claim the same task at once, the second UPDATE matches no row and fails instead of
	 * silently overwriting the first claim.
	 */
	@Version
	private int version;

	protected Task() {
	}

	Task(TaskRequest request, ZoneId zone, Admin createdBy) {
		this.status = TaskStatus.UNASSIGNED;
		this.createdBy = createdBy;
		this.createdAt = Instant.now();
		this.parentTaskId = request.parentTaskId();
		update(request, zone);
	}

	void update(TaskRequest request, ZoneId zone) {
		this.type = request.type();
		this.title = request.title().trim();
		this.description = blankToNull(request.description());
		this.startAt = request.date().atTime(request.startTime()).atZone(zone).toInstant();
		this.durationMinutes = request.durationMinutes();
		this.location = request.location().trim();
		this.employeeName = blankToNull(request.employeeName());
		this.employeeEmail = blankToNull(request.employeeEmail());
		this.employeePhone = blankToNull(request.employeePhone());
		this.supplies.clear();
		request.supplies().forEach(line -> this.supplies.add(new Supply(line.name().trim(), line.quantity())));
	}

	void assignTo(Student student, boolean offShift) {
		requireOpen();
		this.status = TaskStatus.ASSIGNED;
		this.assignee = student;
		this.claimedOffShift = offShift;
	}

	void unassign() {
		requireOpen();
		this.status = TaskStatus.UNASSIGNED;
		this.assignee = null;
		this.claimedOffShift = false;
	}

	void complete(String notes) {
		finish(TaskStatus.COMPLETED, notes);
	}

	void notCompleted(String notes) {
		finish(TaskStatus.NOT_COMPLETED, notes);
	}

	void cancel() {
		requireOpen();
		this.status = TaskStatus.CANCELLED;
		this.finishedAt = Instant.now();
	}

	private void finish(TaskStatus outcome, String notes) {
		if (status != TaskStatus.ASSIGNED) {
			throw new ConflictException("Only an assigned task can be finished.");
		}
		this.status = outcome;
		this.outcomeNotes = blankToNull(notes);
		this.finishedAt = Instant.now();
	}

	void requireOpen() {
		if (!status.isOpen()) {
			throw new ConflictException("This task is " + status.name().toLowerCase().replace('_', ' ') + ", so it can't be changed.");
		}
	}

	Instant endAt() {
		return startAt.plus(Duration.ofMinutes(durationMinutes));
	}

	/** Shares at least one minute with the other task. */
	boolean overlaps(Task other) {
		return startAt.isBefore(other.endAt()) && other.startAt.isBefore(endAt());
	}

	LocalDate date(ZoneId zone) {
		return startAt.atZone(zone).toLocalDate();
	}

	LocalTime startTime(ZoneId zone) {
		return startAt.atZone(zone).toLocalTime();
	}

	LocalTime endTime(ZoneId zone) {
		return endAt().atZone(zone).toLocalTime();
	}

	/** Tasks can't run past midnight (shifts don't). */
	boolean endsSameDay(ZoneId zone) {
		return endAt().atZone(zone).toLocalDate().equals(date(zone)) || endTime(zone).equals(LocalTime.MIDNIGHT);
	}

	private static String blankToNull(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}

	public Long getId() {
		return id;
	}

	public TaskType getType() {
		return type;
	}

	public String getTitle() {
		return title;
	}

	public String getDescription() {
		return description;
	}

	public Instant getStartAt() {
		return startAt;
	}

	public int getDurationMinutes() {
		return durationMinutes;
	}

	public String getLocation() {
		return location;
	}

	public String getEmployeeName() {
		return employeeName;
	}

	public String getEmployeeEmail() {
		return employeeEmail;
	}

	public String getEmployeePhone() {
		return employeePhone;
	}

	public List<Supply> getSupplies() {
		return supplies;
	}

	public TaskStatus getStatus() {
		return status;
	}

	public Student getAssignee() {
		return assignee;
	}

	public boolean isClaimedOffShift() {
		return claimedOffShift;
	}

	public String getOutcomeNotes() {
		return outcomeNotes;
	}

	public Instant getFinishedAt() {
		return finishedAt;
	}

	public Long getParentTaskId() {
		return parentTaskId;
	}

}
