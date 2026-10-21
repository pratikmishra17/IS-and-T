package com.isandt.backend.timeoff;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.isandt.backend.task.TaskResponses.TaskResponse;

/**
 * A time-off request as the API sends it. affectedTasks: the student's assigned tasks inside the
 * requested time, so the admin sees what approving would move to someone else.
 */
public record TimeOffResponse(Long id, Long studentId, String studentName, LocalDate date,
		@JsonFormat(pattern = "HH:mm") LocalTime start, @JsonFormat(pattern = "HH:mm") LocalTime end, String reason,
		TimeOffStatus status, Instant submittedAt, Instant reviewedAt, String reviewNote, List<TaskResponse> affectedTasks) {
}
