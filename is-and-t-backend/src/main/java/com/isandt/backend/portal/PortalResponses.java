package com.isandt.backend.portal;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.isandt.backend.schedule.ScheduleResponses.RequestInfo;
import com.isandt.backend.task.TaskResponses.TaskResponse;

/** What the student's Home and My week pages show. */
public final class PortalResponses {

	private PortalResponses() {
	}

	public record ShiftView(@JsonFormat(pattern = "HH:mm") LocalTime start, @JsonFormat(pattern = "HH:mm") LocalTime end,
			boolean extra) {
	}

	/** Today at a glance. weeklyHourLimit/semesterName are null outside a semester; request is null if never submitted. */
	/**
	 * nextShift / nextTask: the next ones still to come (today or within two weeks), for "next up" when
	 * today is empty (a weekend, say). shiftsSet: an admin has set weekly shifts this semester, so not
	 * having submitted hours doesn't matter.
	 */
	public record MyDay(LocalDate date, String holiday, boolean dayOff, List<ShiftView> shifts, List<TaskResponse> tasks,
			int upForGrabsToday, double weekHours, Integer weeklyHourLimit, String semesterName, RequestInfo request,
			NextShift nextShift, TaskResponse nextTask, boolean shiftsSet) {
	}

	/** A shift on a given date. */
	public record NextShift(LocalDate date, @JsonFormat(pattern = "HH:mm") LocalTime start,
			@JsonFormat(pattern = "HH:mm") LocalTime end, boolean extra) {
	}

	/** Monday to Sunday of one week. */
	public record MyWeek(LocalDate start, List<MyWeekDay> days, double hours, Integer weeklyHourLimit, String semesterName) {
	}

	/** timeOff: approved time off for part of the day (already cut out of shifts). */
	public record MyWeekDay(LocalDate date, String holiday, boolean dayOff, List<ShiftView> shifts, List<ShiftView> timeOff,
			List<TaskResponse> tasks) {
	}

	/**
	 * An item in the student's read-only stock lookup: what it is, how many are free to use, and in
	 * which rooms. Admin-only details (thresholds, history) are left out.
	 */
	public record StockLookup(Long id, String name, String category, String manufacturer, String model,
			Map<String, String> details, int available, List<Room> rooms) {

		public record Room(String label, int quantity) {
		}

	}

	/** Scheduled hours in one week of a semester (weekStart is a Monday). */
	public record WeekHours(LocalDate weekStart, double hours) {
	}

}
