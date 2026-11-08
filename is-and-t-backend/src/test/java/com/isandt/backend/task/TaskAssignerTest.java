package com.isandt.backend.task;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import com.isandt.backend.schedule.ShiftCalendar;
import com.isandt.backend.user.Student;
import com.isandt.backend.user.StudentRepository;

class TaskAssignerTest {

	private static final ZoneId CLEVELAND = ZoneId.of("America/New_York");

	private static final LocalDate MONDAY = LocalDate.of(2026, 10, 19);

	private final StudentRepository students = mock(StudentRepository.class);

	private final TaskRepository tasks = mock(TaskRepository.class);

	private final ShiftCalendar shifts = mock(ShiftCalendar.class);

	private final TaskAssigner assigner = new TaskAssigner(students, tasks, shifts,
			Clock.fixed(MONDAY.atStartOfDay(CLEVELAND).toInstant(), CLEVELAND));

	private final Student ann = student(1L, "Ann");

	private final Student ben = student(2L, "Ben");

	private final Student cat = student(3L, "Cat");

	@BeforeEach
	void everyoneWorksMondayNineToOneExceptCatWhoLeavesAtTen() {
		when(students.findAllByOrderByLastNameAscFirstNameAsc()).thenReturn(List.of(ann, ben, cat));
		ShiftCalendar.Day nineToOne = new ShiftCalendar.Day(List.of(new ShiftCalendar.Shift(LocalTime.of(9, 0), LocalTime.of(13, 0), false)), false);
		ShiftCalendar.Day nineToTen = new ShiftCalendar.Day(List.of(new ShiftCalendar.Shift(LocalTime.of(9, 0), LocalTime.of(10, 0), false)), false);
		when(shifts.between(anyList(), any(), any())).thenReturn(Map.of(
				1L, Map.of(MONDAY, nineToOne), 2L, Map.of(MONDAY, nineToOne), 3L, Map.of(MONDAY, nineToTen)));
	}

	@Test
	void onlyStudentsOnShiftForTheWholeTaskAreEligibleAndTheLeastBusyComesFirst() {
		Task alreadyAnns = task(10L, "09:00", 30);
		alreadyAnns.assignTo(ann, false);
		when(tasks.findStartingBetween(any(), any())).thenReturn(List.of(alreadyAnns));

		List<Student> eligible = assigner.eligible(task(11L, "10:30", 30), Set.of());

		assertThat(eligible).containsExactly(ben, ann); // Cat leaves at 10:00; Ben has fewer tasks today
	}

	@Test
	void someoneBusyWithAnOverlappingTaskIsSkipped() {
		Task bensTask = task(10L, "10:00", 60);
		bensTask.assignTo(ben, false);
		when(tasks.findStartingBetween(any(), any())).thenReturn(List.of(bensTask));

		assertThat(assigner.eligible(task(11L, "10:30", 30), Set.of())).containsExactly(ann);
	}

	@Test
	void whyNotSaysExactlyWhatStopsSomeoneTakingATask() {
		Task bensTask = task(10L, "10:00", 60);
		bensTask.assignTo(ben, false);
		when(tasks.findStartingBetween(any(), any())).thenReturn(List.of(bensTask));
		when(shifts.on(any(), any())).thenAnswer(call -> shifts.between(List.of(call.<Long>getArgument(0)), MONDAY, MONDAY)
				.get(call.<Long>getArgument(0)).get(MONDAY));
		Task later = task(11L, "09:30", 60);

		assertThat(assigner.whyNot(cat, later)).isEqualTo("Cat works 09:00–10:00 that day, which doesn't cover the whole task (09:30–10:30).");
		assertThat(assigner.whyNot(ben, later)).startsWith("Ben already has \"").endsWith("then (10:00–11:00).");
		assertThat(assigner.whyNot(ann, later)).isNull();
		Student dee = new Student("dee@example.com", "Dee", "Student", "S4", null); // no password yet
		ReflectionTestUtils.setField(dee, "id", 4L);
		assertThat(assigner.whyNot(dee, later)).contains("hasn't set a password yet");
	}

	@Test
	void excludedStudentsAreLeftOut() {
		when(tasks.findStartingBetween(any(), any())).thenReturn(List.of());

		assertThat(assigner.eligible(task(11L, "09:30", 30), Set.of(1L, 2L))).containsExactly(cat);
	}

	@Test
	void availabilityListsEveryoneWithWhyTheyCantTakeItAndAvailableFirst() {
		Task bensTask = task(10L, "10:00", 60);
		bensTask.assignTo(ben, false);
		when(tasks.findStartingBetween(any(), any())).thenReturn(List.of(bensTask));

		List<TaskAssigner.Availability> all = assigner.availability(MONDAY, LocalTime.of(10, 30), LocalTime.of(11, 0), null);

		assertThat(all).extracting(a -> a.student().getFirstName() + ": " + a.problem()).containsExactly(
				"Ann: null", "Ben: has another task then", "Cat: not on shift for the whole time");
	}

	private static Task task(Long id, String start, int minutes) {
		Task task = new Task(new TaskRequest(TaskType.FIX, "Fix printer", null, MONDAY, LocalTime.parse(start), minutes,
				"RT 1408", "Pat Employee", null, null, List.of(), List.of(), null, null), CLEVELAND, null);
		ReflectionTestUtils.setField(task, "id", id);
		return task;
	}

	private static Student student(Long id, String name) {
		Student student = new Student(name.toLowerCase() + "@example.com", name, "Student", "S" + id, null);
		student.changePasswordHash("{bcrypt}x");
		ReflectionTestUtils.setField(student, "id", id);
		return student;
	}

}
