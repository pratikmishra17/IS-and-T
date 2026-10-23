package com.isandt.backend.task;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.isandt.backend.inventory.PlannedLine;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * A task as an admin enters it. Date and start time are campus time ("2026-10-21", "09:30"), so the
 * browser's own time zone never matters. The employee's details are all optional. supplies are typed
 * freely (things to bring); items reserve stock from the inventory (optional). parentTaskId marks a
 * follow-up deployment for backordered items. autoAssign false keeps a new task unassigned (to leave it
 * open, or because the admin is about to give it to someone in particular).
 */
public record TaskRequest(
		@NotNull TaskType type,
		@NotBlank @Size(max = 200) String title,
		@Size(max = 2000) String description,
		@NotNull LocalDate date,
		@NotNull @JsonFormat(pattern = "HH:mm") LocalTime startTime,
		@Min(5) @Max(600) int durationMinutes,
		@NotBlank @Size(max = 200) String location,
		@Size(max = 200) String employeeName,
		@Email @Size(max = 255) String employeeEmail,
		@Size(max = 50) String employeePhone,
		@NotNull @Size(max = 30) List<@Valid SupplyLine> supplies,
		@NotNull @Size(max = 20) List<@Valid PlannedLine> items,
		Long parentTaskId,
		Boolean autoAssign) {

	/** New tasks go to the least busy student on shift unless the admin says not to (autoAssign false). */
	boolean assignAutomatically() {
		return autoAssign == null || autoAssign;
	}

}
