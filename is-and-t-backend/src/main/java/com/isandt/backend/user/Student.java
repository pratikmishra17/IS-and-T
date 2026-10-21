package com.isandt.backend.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/** A student worker. Logs in at the user portal (/login). Added by an admin. */
@Entity
@Table(name = "students")
public class Student extends Account {

	/** The CSU student ID. Required and unique. */
	@Column(nullable = false, unique = true)
	private String studentId;

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

	public String getStudentId() {
		return studentId;
	}

}
