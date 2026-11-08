package com.isandt.backend.activity;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** One thing someone did: who, when, what, to what, and whether it worked. Never changed once written. */
@Entity
@Table(name = "activity_log")
public class ActivityEntry {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "occurred_at", nullable = false)
	private Instant occurredAt;

	/** "ADMIN", "STUDENT", or null when nobody was logged in. */
	@Column(name = "actor_role")
	private String actorRole;

	@Column(name = "actor_id")
	private Long actorId;

	@Column(name = "actor_name")
	private String actorName;

	@Column(name = "actor_email")
	private String actorEmail;

	@Column(nullable = false)
	private String action;

	private String target;

	@Column(name = "http_method", nullable = false)
	private String httpMethod;

	@Column(nullable = false)
	private String path;

	@Column(nullable = false)
	private int status;

	private String reason;

	@Column(name = "ip_address")
	private String ipAddress;

	protected ActivityEntry() {
	}

	ActivityEntry(Instant occurredAt, Actor actor, String action, String target, String httpMethod, String path,
			int status, String reason, String ipAddress) {
		this.occurredAt = occurredAt;
		if (actor != null) {
			this.actorRole = actor.role();
			this.actorId = actor.id();
			this.actorName = cut(actor.name(), 201);
			this.actorEmail = cut(actor.email(), 255);
		}
		this.action = cut(action, 120);
		this.target = cut(target, 255);
		this.httpMethod = httpMethod;
		this.path = cut(path, 255);
		this.status = status;
		this.reason = cut(reason, 500);
		this.ipAddress = cut(ipAddress, 45);
	}

	/** Who did it, as they were at the time. */
	record Actor(String role, Long id, String name, String email) {
	}

	private static String cut(String text, int max) {
		return text == null || text.length() <= max ? text : text.substring(0, max - 1) + "…";
	}

	public Long getId() {
		return id;
	}

	public Instant getOccurredAt() {
		return occurredAt;
	}

	public String getActorRole() {
		return actorRole;
	}

	public Long getActorId() {
		return actorId;
	}

	public String getActorName() {
		return actorName;
	}

	public String getActorEmail() {
		return actorEmail;
	}

	public String getAction() {
		return action;
	}

	public String getTarget() {
		return target;
	}

	public String getHttpMethod() {
		return httpMethod;
	}

	public String getPath() {
		return path;
	}

	public int getStatus() {
		return status;
	}

	public String getReason() {
		return reason;
	}

	public String getIpAddress() {
		return ipAddress;
	}

	public boolean succeeded() {
		return status >= 200 && status < 300;
	}

}
