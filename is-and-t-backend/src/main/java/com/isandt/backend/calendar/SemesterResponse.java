package com.isandt.backend.calendar;

import java.time.LocalDate;

/** A semester as the API sends it. "current" means today (campus time) falls inside it. */
public record SemesterResponse(Long id, String name, SemesterType type, LocalDate startDate, LocalDate endDate,
		int weeklyHourLimit, boolean current) {

	static SemesterResponse from(Semester semester, LocalDate today) {
		return new SemesterResponse(semester.getId(), semester.getName(), semester.getType(), semester.getStartDate(),
				semester.getEndDate(), semester.getWeeklyHourLimit(), semester.contains(today));
	}

}
