package com.isandt.backend.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

/** A student worker. Logs in at the user portal (/login). Added by an admin. */
@Entity
@Table(name = "students")
public class Student extends Account {

	/** The CSU student ID. Required and unique. */
	@Column(nullable = false, unique = true)
	private String studentId;

	/** The secret in this student's calendar link; null until they ask for one. */
	private String calendarToken;

	/** What they may do with the team's tasks on the Team page; an admin changes it. */
	@Enumerated(EnumType.STRING)
	@Column(name = "task_access", nullable = false)
	private TaskAccess taskAccess = TaskAccess.VIEW;

	protected Student() {
	}

	public Student(String email, String firstName, String lastName, String studentId, Admin createdBy) {
		super(email, firstName, lastName, createdBy);
		this.studentId = studentId.trim();
	}

	@Override
	public Role getRole() {
		return Role.STUDENT;
	}

	public void changeStudentId(String studentId) {
		this.studentId = studentId.trim();
	}

	public String getCalendarToken() {
		return calendarToken;
	}

	public void changeCalendarToken(String calendarToken) {
		this.calendarToken = calendarToken;
	}

	public String getStudentId() {
		return studentId;
	}

	public TaskAccess getTaskAccess() {
		return taskAccess;
	}

	public void changeTaskAccess(TaskAccess taskAccess) {
		this.taskAccess = taskAccess;
	}

}
