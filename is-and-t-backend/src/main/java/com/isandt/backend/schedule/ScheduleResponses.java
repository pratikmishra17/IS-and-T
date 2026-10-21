package com.isandt.backend.schedule;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.isandt.backend.calendar.SemesterResponse;

/**
 * The shapes the schedule endpoints send back. Grouped in one file because they only make sense
 * together; each is a plain record.
 */
public final class ScheduleResponses {

	private ScheduleResponses() {
	}

	/** The latest request for a semester, or null if the student never submitted. */
	public record RequestInfo(Long id, ScheduleRequestStatus status, Instant submittedAt, Instant reviewedAt) {

		static RequestInfo from(ScheduleRequest request) {
			return request == null ? null
					: new RequestInfo(request.getId(), request.getStatus(), request.getSubmittedAt(), request.getReviewedAt());
		}

	}

	/** One student's schedule for one semester, as the student or an admin sees it. */
	public record StudentSchedule(Long studentId, String studentName, SemesterResponse semester,
			List<TimeBlock> classes, List<TimeBlock> preferred, List<TimeBlock> shifts, double weeklyHours,
			RequestInfo request, List<ExceptionInfo> exceptions) {
	}

	/** A request waiting in the admin portal. */
	public record PendingRequest(Long id, Long studentId, String studentName, Long semesterId, String semesterName,
			Instant submittedAt) {
	}

	public record ExceptionInfo(Long id, LocalDate date, ShiftExceptionType type,
			@JsonFormat(pattern = "HH:mm") LocalTime start, @JsonFormat(pattern = "HH:mm") LocalTime end,
			String reason) {

		static ExceptionInfo from(ShiftException exception) {
			return new ExceptionInfo(exception.getId(), exception.getDate(), exception.getType(), exception.getStart(),
					exception.getEnd(), exception.getReason());
		}

	}

	/** The team week view: Monday to Friday, every active student. */
	public record Week(LocalDate start, List<WeekDay> days, List<StudentWeek> students, Integer weeklyHourLimit,
			String semesterName) {
	}

	public record WeekDay(LocalDate date, String holiday) {
	}

	public record StudentWeek(Long studentId, String name, List<StudentDay> days, double hours, boolean overLimit) {
	}

	public record StudentDay(LocalDate date, List<WeekShift> shifts, boolean cancelled) {
	}

	public record WeekShift(@JsonFormat(pattern = "HH:mm") LocalTime start, @JsonFormat(pattern = "HH:mm") LocalTime end,
			boolean extra) {
	}

}
