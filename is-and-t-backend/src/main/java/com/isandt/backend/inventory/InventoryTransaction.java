package com.isandt.backend.inventory;

import java.time.Instant;

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

/** One change to a stock level: who, what, how many (+/-), why and when. Never edited afterwards. */
@Entity
@Table(name = "inventory_transactions")
public class InventoryTransaction {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "item_id")
	private Item item;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "location_id")
	private StorageLocation location;

	@Column(nullable = false)
	private int delta;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private TransactionReason reason;

	private String note;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "admin_id")
	private Admin admin;

	/** For deployments: the student who completed the task, and the task (by id). */
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "student_id")
	private Student student;

	@Column(name = "task_id")
	private Long taskId;

	@Column(nullable = false)
	private Instant occurredAt;

	protected InventoryTransaction() {
	}

	static InventoryTransaction forTask(StockLevel stock, int delta, Long taskId, Student student) {
		InventoryTransaction transaction = new InventoryTransaction(stock, delta, TransactionReason.DEPLOYMENT,
				"Task #" + taskId, null);
		transaction.taskId = taskId;
		transaction.student = student;
		return transaction;
	}

	InventoryTransaction(StockLevel stock, int delta, TransactionReason reason, String note, Admin admin) {
		this.item = stock.getItem();
		this.location = stock.getLocation();
		this.delta = delta;
		this.reason = reason;
		this.note = note == null || note.isBlank() ? null : note.trim();
		this.admin = admin;
		this.occurredAt = Instant.now();
	}

	public Long getId() {
		return id;
	}

	public Item getItem() {
		return item;
	}

	public StorageLocation getLocation() {
		return location;
	}

	public int getDelta() {
		return delta;
	}

	public TransactionReason getReason() {
		return reason;
	}

	public String getNote() {
		return note;
	}

	public Admin getAdmin() {
		return admin;
	}

	public Student getStudent() {
		return student;
	}

	public Long getTaskId() {
		return taskId;
	}

	public Instant getOccurredAt() {
		return occurredAt;
	}

}
