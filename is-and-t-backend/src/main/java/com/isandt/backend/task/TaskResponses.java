package com.isandt.backend.task;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.isandt.backend.inventory.PlannedItemResponse;

/** The shapes the task endpoints send back. */
public final class TaskResponses {

	private TaskResponses() {
	}

	public record Person(Long id, String name) {
	}

	public record Employee(String name, String email, String phone, String department) {
	}

	/** A task. date/startTime/endTime are campus time, ready to display. */
	public record TaskResponse(Long id, TaskType type, String title, String description, LocalDate date,
			@JsonFormat(pattern = "HH:mm") java.time.LocalTime startTime,
			@JsonFormat(pattern = "HH:mm") java.time.LocalTime endTime, int durationMinutes, String building, String room,
			Employee employee, TaskStatus status, Person assignee, boolean claimedOffShift, String outcomeNotes,
			Instant finishedAt, Long parentTaskId, List<PlannedItemResponse> items) {

		static TaskResponse from(Task task, ZoneId zone, List<PlannedItemResponse> items) {
			Person assignee = task.getAssignee() == null ? null
					: new Person(task.getAssignee().getId(), task.getAssignee().getFirstName() + " " + task.getAssignee().getLastName());
			return new TaskResponse(task.getId(), task.getType(), task.getTitle(), task.getDescription(), task.date(zone),
					task.startTime(zone), task.endTime(zone), task.getDurationMinutes(), task.getBuilding(), task.getRoom(),
					new Employee(task.getEmployeeName(), task.getEmployeeEmail(), task.getEmployeePhone(), task.getEmployeeDepartment()),
					task.getStatus(), assignee, task.isClaimedOffShift(), task.getOutcomeNotes(), task.getFinishedAt(),
					task.getParentTaskId(), items);
		}

	}

	public record EventResponse(TaskEventType type, String actor, String detail, Instant occurredAt) {

		static EventResponse from(TaskEvent event) {
			return new EventResponse(event.getType(), event.getActor(), event.getDetail(), event.getOccurredAt());
		}

	}

	/** A task with its full history, for the detail view. */
	public record TaskDetail(TaskResponse task, List<EventResponse> history) {
	}

	/** Someone a task could go to. eligible = on shift for the whole task and free at that time. */
	public record Candidate(Long id, String name, boolean eligible) {
	}

	/**
	 * A student's own task lists in the user portal. availableDuringMyShifts: ids of the available
	 * tasks that fall entirely inside one of this student's shifts.
	 */
	public record MyTasks(List<TaskResponse> upcoming, List<TaskResponse> available, List<Long> availableDuringMyShifts,
			List<TaskResponse> recent) {
	}

	/** A backordered item with the task that still owes it. */
	public record Backorder(Long plannedItemId, String itemName, String locationLabel, int missing, int availableNow,
			TaskResponse task) {
	}

}
