package com.isandt.backend.task;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import com.isandt.backend.schedule.ShiftCalendar;
import com.isandt.backend.user.Student;
import com.isandt.backend.user.StudentRepository;

/**
 * Decides who can take a task. A student is eligible when they are active (with a password, so they
 * can log in), on shift for the whole task, and not busy with another task at that time. The best
 * candidate has the fewest tasks that day, then that week; ties are broken at random.
 */
@Component
class TaskAssigner {

	private final StudentRepository students;

	private final TaskRepository tasks;

	private final ShiftCalendar shifts;

	private final ZoneId zone;

	TaskAssigner(StudentRepository students, TaskRepository tasks, ShiftCalendar shifts, Clock clock) {
		this.students = students;
		this.tasks = tasks;
		this.shifts = shifts;
		this.zone = clock.getZone();
	}

	/** Eligible students for the task, best first. */
	List<Student> eligible(Task task, Set<Long> excluded) {
		if (!task.endsSameDay(zone)) {
			return List.of();
		}
		LocalDate date = task.date(zone);
		List<Student> pool = students.findAllByOrderByLastNameAscFirstNameAsc().stream()
				.filter(s -> s.isActive() && s.getPasswordHash() != null && !excluded.contains(s.getId()))
				.toList();
		Map<Long, Map<LocalDate, ShiftCalendar.Day>> days = shifts.between(pool.stream().map(Student::getId).toList(), date, date);

		LocalDate monday = date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
		List<Task> week = tasks.findStartingBetween(monday.atStartOfDay(zone).toInstant(),
				monday.plusWeeks(1).atStartOfDay(zone).toInstant()).stream()
				.filter(other -> !other.getId().equals(task.getId()) && other.getAssignee() != null
						&& other.getStatus() != TaskStatus.CANCELLED && other.getStatus() != TaskStatus.UNASSIGNED)
				.toList();
		Set<Long> busy = week.stream().filter(other -> other.getStatus() == TaskStatus.ASSIGNED && other.overlaps(task))
				.map(other -> other.getAssignee().getId()).collect(Collectors.toSet());
		Map<Long, Long> perWeek = week.stream().collect(Collectors.groupingBy(o -> o.getAssignee().getId(), Collectors.counting()));
		Map<Long, Long> perDay = week.stream().filter(o -> o.date(zone).equals(date))
				.collect(Collectors.groupingBy(o -> o.getAssignee().getId(), Collectors.counting()));

		List<Student> candidates = new ArrayList<>(pool.stream()
				.filter(s -> coversTask(days.get(s.getId()).get(date), task) && !busy.contains(s.getId()))
				.toList());
		Collections.shuffle(candidates); // random order first, so the stable sort below breaks ties randomly
		candidates.sort(Comparator.<Student>comparingLong(s -> perDay.getOrDefault(s.getId(), 0L))
				.thenComparingLong(s -> perWeek.getOrDefault(s.getId(), 0L)));
		return candidates;
	}

	/** One student's availability for a time: problem is null when they're free and on shift. */
	record Availability(Student student, String problem) {
	}

	/**
	 * Every active student, with why they couldn't take a task at this time, if they couldn't:
	 * hasn't set a password (can't log in yet), not working that day, not on shift for the whole
	 * time, or busy with another task. Available students first, then by name. The admin may still
	 * pick anyone; this only says who'd be a good choice.
	 */
	List<Availability> availability(LocalDate date, LocalTime start, LocalTime end, Long ignoreTaskId) {
		List<Student> pool = students.findAllByOrderByLastNameAscFirstNameAsc().stream().filter(Student::isActive).toList();
		Map<Long, Map<LocalDate, ShiftCalendar.Day>> days = shifts.between(pool.stream().map(Student::getId).toList(), date, date);
		Set<Long> busy = tasks.findStartingBetween(date.atStartOfDay(zone).toInstant(), date.plusDays(1).atStartOfDay(zone).toInstant()).stream()
				.filter(other -> !other.getId().equals(ignoreTaskId) && other.getStatus() == TaskStatus.ASSIGNED && other.getAssignee() != null)
				.filter(other -> other.startTime(zone).isBefore(end) && start.isBefore(other.endTime(zone)))
				.map(other -> other.getAssignee().getId()).collect(Collectors.toSet());
		List<Availability> all = pool.stream().map(student -> {
			ShiftCalendar.Day day = days.get(student.getId()).get(date);
			String problem = null;
			if (student.getPasswordHash() == null) {
				problem = "hasn't set a password yet";
			}
			else if (day.shifts().isEmpty()) {
				problem = "not working that day";
			}
			else if (day.shifts().stream().noneMatch(shift -> !shift.start().isAfter(start) && !shift.end().isBefore(end))) {
				problem = "not on shift for the whole time";
			}
			else if (busy.contains(student.getId())) {
				problem = "has another task then";
			}
			return new Availability(student, problem);
		}).toList();
		return all.stream().sorted(Comparator.comparing((Availability a) -> a.problem() != null)).toList();
	}

	boolean isOnShiftForWholeTask(Student student, Task task) {
		return task.endsSameDay(zone) && coversTask(shifts.on(student.getId(), task.date(zone)), task);
	}

	/** Students working at any time on the task's day: who to tell when a task needs someone. */
	List<Student> onShiftThatDay(Task task, Set<Long> excluded) {
		LocalDate date = task.date(zone);
		List<Student> pool = students.findAllByOrderByLastNameAscFirstNameAsc().stream()
				.filter(s -> s.isActive() && s.getPasswordHash() != null && !excluded.contains(s.getId()))
				.toList();
		Map<Long, Map<LocalDate, ShiftCalendar.Day>> days = shifts.between(pool.stream().map(Student::getId).toList(), date, date);
		return pool.stream().filter(s -> !days.get(s.getId()).get(date).shifts().isEmpty()).toList();
	}

	private boolean coversTask(ShiftCalendar.Day day, Task task) {
		LocalTime start = task.startTime(zone);
		LocalTime end = task.endTime(zone);
		return day.shifts().stream().anyMatch(shift -> !shift.start().isAfter(start) && !shift.end().isBefore(end));
	}

}
