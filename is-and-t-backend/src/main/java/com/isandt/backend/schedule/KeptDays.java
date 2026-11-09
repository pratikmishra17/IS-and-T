package com.isandt.backend.schedule;

import java.time.Clock;
import java.time.LocalDate;
import java.time.DayOfWeek;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import com.isandt.backend.calendar.Semester;
import com.isandt.backend.user.Student;

/**
 * Saves days before a student's weekly shifts change, so the change only affects the days it's
 * meant to. Call it before the weekly shifts are replaced, inside the same transaction.
 */
@Component
class KeptDays {

	private final KeptDayRepository kept;

	private final ShiftPatternRepository patterns;

	private final Clock clock;

	KeptDays(KeptDayRepository kept, ShiftPatternRepository patterns, Clock clock) {
		this.kept = kept;
		this.patterns = patterns;
		this.clock = clock;
	}

	/**
	 * The admin is replacing the whole week from today: keep every past day as it was. Days from
	 * today on that were kept for a later "every week from ..." change follow the new week instead.
	 */
	void beforeNewWeek(Student student, Semester semester) {
		LocalDate today = LocalDate.now(clock);
		keep(student, semester, semester.getStartDate(), today.minusDays(1), null);
		kept.deleteFrom(student, semester, today);
		kept.flush();
	}

	/**
	 * One weekday changes "every week from" a date: keep every past day, and that weekday on the
	 * days before the change starts (they keep the old hours).
	 */
	void beforeWeekdayChange(Student student, Semester semester, DayOfWeek day, LocalDate from) {
		LocalDate today = LocalDate.now(clock);
		keep(student, semester, semester.getStartDate(), today.minusDays(1), null);
		keep(student, semester, today, from.minusDays(1), day);
		kept.flush();
	}

	/** Saves each date in from..to (inside the semester, and on the given weekday if any) not kept yet. */
	private void keep(Student student, Semester semester, LocalDate from, LocalDate to, DayOfWeek onlyDay) {
		LocalDate first = from.isBefore(semester.getStartDate()) ? semester.getStartDate() : from;
		LocalDate last = to.isAfter(semester.getEndDate()) ? semester.getEndDate() : to;
		if (last.isBefore(first)) {
			return;
		}
		List<TimeBlock> weekly = patterns.findByStudentAndSemesterOrderByDayAscStartAsc(student, semester).stream()
				.map(ShiftPattern::toBlock).toList();
		Set<LocalDate> already = kept.findByStudentAndSemester(student, semester).stream().map(KeptDay::getDate)
				.collect(Collectors.toSet());
		for (LocalDate date = first; !date.isAfter(last); date = date.plusDays(1)) {
			DayOfWeek weekday = date.getDayOfWeek();
			if (already.contains(date) || (onlyDay != null && weekday != onlyDay)
					|| weekday == DayOfWeek.SATURDAY || weekday == DayOfWeek.SUNDAY) {
				continue;
			}
			kept.save(new KeptDay(student, semester, date, weekly.stream().filter(block -> block.day() == weekday).toList()));
		}
	}

}
