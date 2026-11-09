package com.isandt.backend.task;

import java.time.Instant;

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

/** One line of a task's history: what happened, who did it, when. Never changed afterwards. */
@Entity
@Table(name = "task_events")
public class TaskEvent {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "task_id")
	private Task task;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private TaskEventType type;

	/** Who did it, as a name ("Ada Admin", "Sam Student", "System"): history stays readable even if they're removed. */
	@Column(nullable = false)
	private String actor;

	private String detail;

	@Column(nullable = false)
	private Instant occurredAt;

	protected TaskEvent() {
	}

	TaskEvent(Task task, TaskEventType type, String actor, String detail) {
		this.task = task;
		this.type = type;
		this.actor = actor;
		this.detail = detail;
		this.occurredAt = Instant.now();
	}

	public TaskEventType getType() {
		return type;
	}

	public String getActor() {
		return actor;
	}

	public String getDetail() {
		return detail;
	}

	public Instant getOccurredAt() {
		return occurredAt;
	}

}
