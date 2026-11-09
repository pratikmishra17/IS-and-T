package com.isandt.backend.task;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import com.isandt.backend.calendar.HolidaysAdded;
import com.isandt.backend.schedule.ShiftsChanged;
import com.isandt.backend.user.Student;
import com.isandt.backend.user.StudentRepository;
import com.isandt.backend.user.StudentUnavailable;

/**
 * Keeps assignments valid when a student's situation changes. Runs inside the same transaction as
 * the change that published the event, so both are saved together or not at all.
 */
@Component
class TaskAvailabilityListener {

	private final TaskRepository tasks;

	private final StudentRepository students;

	private final TaskAssigner assigner;

	private final TaskWorkflow workflow;

	private final Clock clock;

	TaskAvailabilityListener(TaskRepository tasks, StudentRepository students, TaskAssigner assigner,
			TaskWorkflow workflow, Clock clock) {
		this.tasks = tasks;
		this.students = students;
		this.assigner = assigner;
		this.workflow = workflow;
		this.clock = clock;
	}

	/** Their shifts changed: any upcoming task no longer inside a shift goes to someone else. */
	@EventListener
	void shiftsChanged(ShiftsChanged event) {
		students.findById(event.studentId()).ifPresent(student -> upcoming(event.studentId()).stream()
				.filter(task -> !assigner.isOnShiftForWholeTask(student, task))
				.forEach(task -> workflow.reassign(task, TaskWorkflow.SYSTEM, "their shifts changed and they're no longer working then")));
	}

	/** New holidays: weekly shifts are off those days, so re-check everyone's upcoming tasks. */
	@EventListener
	void holidaysAdded(HolidaysAdded event) {
		students.findAll().stream().filter(Student::isActive).forEach(student -> shiftsChanged(new ShiftsChanged(student.getId())));
	}

	/** Disabled or removed: all their upcoming tasks go to someone else. */
	@EventListener
	void studentUnavailable(StudentUnavailable event) {
		upcoming(event.studentId()).forEach(task -> workflow.reassign(task, TaskWorkflow.SYSTEM, event.reason()));
	}

	private List<Task> upcoming(Long studentId) {
		return students.findById(studentId)
				.map(student -> tasks.findForStudent(student, List.of(TaskStatus.ASSIGNED), Instant.now(clock)))
				.orElse(List.of());
	}

}
