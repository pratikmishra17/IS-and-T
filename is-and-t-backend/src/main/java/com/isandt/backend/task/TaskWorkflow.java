package com.isandt.backend.task;

import java.time.Clock;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.isandt.backend.inventory.ReservationService;
import com.isandt.backend.task.TaskResponses.TaskResponse;
import com.isandt.backend.user.Student;

/**
 * The steps several actions share: assign automatically, take a task off someone, write history,
 * describe a task. Admin actions, student actions and the schedule listener all go through here,
 * so they behave the same way.
 */
@Component
class TaskWorkflow {

	static final String SYSTEM = "System";

	private final TaskEventRepository events;

	private final TaskAssigner assigner;

	private final TaskEmails emails;

	private final ReservationService reservations;

	private final ZoneId zone;

	TaskWorkflow(TaskEventRepository events, TaskAssigner assigner, TaskEmails emails, ReservationService reservations,
			Clock clock) {
		this.events = events;
		this.assigner = assigner;
		this.emails = emails;
		this.reservations = reservations;
		this.zone = clock.getZone();
	}

	void record(Task task, TaskEventType type, String actor, String detail) {
		events.save(new TaskEvent(task, type, actor, detail));
	}

	/**
	 * Gives the task to the best eligible student. If there's nobody, it stays unassigned and the
	 * students working at some point that day are emailed that they can claim it; the returned
	 * warning says so.
	 */
	Optional<String> autoAssign(Task task, String actor, Set<Long> excluded) {
		List<Student> eligible = assigner.eligible(task, excluded);
		if (!eligible.isEmpty()) {
			Student student = eligible.getFirst();
			task.assignTo(student, false);
			record(task, TaskEventType.AUTO_ASSIGNED, actor, "Assigned to " + name(student));
			emails.assigned(student, task);
			return Optional.empty();
		}
		if (task.getStatus() == TaskStatus.ASSIGNED) {
			task.unassign();
		}
		List<Student> working = assigner.onShiftThatDay(task, excluded);
		record(task, TaskEventType.UNASSIGNED, actor, "Nobody is on shift for the whole task; waiting for someone to claim it");
		emails.available(working, task);
		return Optional.of("Nobody is on shift for the whole task, so it's unassigned."
				+ (working.isEmpty() ? " Nobody is working that day either." : " " + working.size()
						+ (working.size() == 1 ? " student" : " students") + " working that day were emailed that they can claim it."));
	}

	/** The assignee can no longer do the task: take it off them, tell them, and find someone else. */
	void reassign(Task task, String actor, String reason) {
		Student previous = task.getAssignee();
		task.unassign();
		record(task, TaskEventType.UNASSIGNED, actor, name(previous) + ": " + reason);
		emails.removed(previous, task, reason);
		autoAssign(task, actor, Set.of(previous.getId()));
	}

	TaskResponse describe(Task task) {
		return TaskResponse.from(task, zone, task.getId() == null ? List.of() : reservations.forTask(task.getId()));
	}

	static String name(Student student) {
		return student.getFirstName() + " " + student.getLastName();
	}

}
