package com.isandt.backend.user;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/** A manager. Logs in at the admin portal (/admin/login). Added by another admin, or by the dev seed. */
@Entity
@Table(name = "admins")
public class Admin extends Account {

	/** Whether this admin gets the 8am daily digest email (phase 5). */
	private boolean receivesDigest;

	protected Admin() {
	}

	public Admin(String email, String firstName, String lastName, Admin createdBy) {
		super(email, firstName, lastName, createdBy);
	}

	@Override
	public Role getRole() {
		return Role.ADMIN;
	}

	public boolean isReceivesDigest() {
		return receivesDigest;
	}

	public void setReceivesDigest(boolean receivesDigest) {
		this.receivesDigest = receivesDigest;
	}

}
