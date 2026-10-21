package com.isandt.backend.schedule;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.isandt.backend.calendar.Semester;
import com.isandt.backend.calendar.SemesterService;

/**
 * Answers "when does each student work on each date?". A student's shifts on a date are:
 * <ol>
 * <li>their weekly shifts for that weekday, if the date is inside a semester,</li>
 * <li>none of those if the date has a day off (CANCEL),</li>
 * <li>plus any extra shifts (EXTRA) on that date,</li>
 * <li>with any time off (OFF) cut out: 09:00–13:00 with 10:00–11:00 off becomes 09:00–10:00 and 11:00–13:00.</li>
 * </ol>
 * Nothing is stored per date: it's worked out from the weekly pattern each time it's needed.
 */
@Component
public class ShiftCalendar {

	/** One shift on one date. extra = added for that date only, not part of the weekly pattern. */
	public record Shift(LocalTime start, LocalTime end, boolean extra) {
	}

	/** A stretch of time on one date. */
	public record Window(LocalTime start, LocalTime end) {
	}

	/** A student's day: their shifts (time off already cut out), whether it's a day off, and the time off. */
	public record Day(List<Shift> shifts, boolean cancelled, List<Window> timeOff) {

		public Day(List<Shift> shifts, boolean cancelled) {
			this(shifts, cancelled, List.of());
		}

	}

	private final SemesterService semesters;

	private final ShiftPatternRepository patterns;

	private final ShiftExceptionRepository exceptions;

	ShiftCalendar(SemesterService semesters, ShiftPatternRepository patterns, ShiftExceptionRepository exceptions) {
		this.semesters = semesters;
		this.patterns = patterns;
		this.exceptions = exceptions;
	}

	/**
	 * Every listed student's shifts on every date from..to: student id → date → day. Three queries
	 * in total (semesters, weekly shifts, exceptions), however many students and days.
	 */
	@Transactional(readOnly = true)
	public Map<Long, Map<LocalDate, Day>> between(Collection<Long> studentIds, LocalDate from, LocalDate to) {
		List<Semester> inRange = semesters.overlapping(from, to);
		List<ShiftPattern> weekly = inRange.isEmpty() ? List.of() : patterns.findBySemesterIn(inRange);
		List<ShiftException> changes = exceptions.findByDateBetween(from, to);

		Map<Long, Map<LocalDate, Day>> result = new HashMap<>();
		for (Long studentId : studentIds) {
			Map<LocalDate, Day> days = new HashMap<>();
			for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
				LocalDate day = date;
				Optional<Semester> semester = inRange.stream().filter(s -> s.contains(day)).findFirst();
				boolean cancelled = changes.stream().anyMatch(change -> change.studentId().equals(studentId)
						&& change.getDate().equals(day) && change.getType() == ShiftExceptionType.CANCEL);

				List<Shift> shifts = new ArrayList<>();
				if (semester.isPresent() && !cancelled) {
					weekly.stream()
						.filter(p -> p.studentId().equals(studentId) && p.semesterId().equals(semester.get().getId())
								&& p.toBlock().day() == day.getDayOfWeek())
						.forEach(p -> shifts.add(new Shift(p.toBlock().start(), p.toBlock().end(), false)));
				}
				changes.stream()
					.filter(change -> change.studentId().equals(studentId) && change.getDate().equals(day)
							&& change.getType() == ShiftExceptionType.EXTRA)
					.forEach(change -> shifts.add(new Shift(change.getStart(), change.getEnd(), true)));
				List<Window> off = changes.stream()
					.filter(change -> change.studentId().equals(studentId) && change.getDate().equals(day)
							&& change.getType() == ShiftExceptionType.OFF)
					.map(change -> new Window(change.getStart(), change.getEnd()))
					.sorted(Comparator.comparing(Window::start))
					.toList();
				List<Shift> working = cutOut(shifts, off);
				working.sort(Comparator.comparing(Shift::start));
				days.put(day, new Day(List.copyOf(working), cancelled, off));
			}
			result.put(studentId, days);
		}
		return result;
	}

	/** The shifts with every time-off window removed; a shift can be split in two. */
	static List<Shift> cutOut(List<Shift> shifts, List<Window> off) {
		List<Shift> result = new ArrayList<>(shifts);
		for (Window window : off) {
			List<Shift> next = new ArrayList<>();
			for (Shift shift : result) {
				if (!window.start().isBefore(shift.end()) || !shift.start().isBefore(window.end())) {
					next.add(shift); // no overlap
					continue;
				}
				if (shift.start().isBefore(window.start())) {
					next.add(new Shift(shift.start(), window.start(), shift.extra()));
				}
				if (window.end().isBefore(shift.end())) {
					next.add(new Shift(window.end(), shift.end(), shift.extra()));
				}
			}
			result = next;
		}
		return result;
	}

	/** One student's shifts on one date. */
	@Transactional(readOnly = true)
	public Day on(Long studentId, LocalDate date) {
		return between(List.of(studentId), date, date).get(studentId).get(date);
	}

}
