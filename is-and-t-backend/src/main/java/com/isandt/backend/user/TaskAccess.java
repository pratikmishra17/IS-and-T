package com.isandt.backend.user;

/**
 * What a student may do with the team's tasks on the student portal's Team page. Everyone can see
 * all shifts and tasks; each level adds to the one before.
 */
public enum TaskAccess {

	/** Look only (and offer to take a task, and ask for shift changes). The default. */
	VIEW,

	/** Also mark any task done or not done. */
	COMPLETE,

	/** Also create, change, assign and cancel tasks, as an admin can. */
	EDIT;

	public boolean allows(TaskAccess needed) {
		return compareTo(needed) >= 0;
	}

}
