package com.isandt.backend.task;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.isandt.backend.common.error.ConflictException;
import com.isandt.backend.common.error.NotFoundException;
import com.isandt.backend.inventory.ReservationService;
import com.isandt.backend.task.TaskResponses.MyTasks;
import com.isandt.backend.task.TaskResponses.Person;
import com.isandt.backend.task.TaskResponses.TaskResponse;
import com.isandt.backend.user.Student;
import com.isandt.backend.user.StudentRepository;

/** What students do with tasks in the user portal: claim, opt out, hand off, complete. */
@Service
public class StudentTaskService {

	private final TaskRepository tasks;

	private final StudentRepository students;

	private final ReservationService reservations;

	private final TaskAssigner assigner;

	private final TaskWorkflow workflow;

	private final TaskEmails emails;

	private final ZoneId zone;

	private final Clock clock;

	StudentTaskService(TaskRepository tasks, StudentRepository students, ReservationService reservations,
			TaskAssigner assigner, TaskWorkflow workflow, TaskEmails emails, Clock clock) {
		this.tasks = tasks;
		this.students = students;
		this.reservations = reservations;
		this.assigner = assigner;
		this.workflow = workflow;
		this.emails = emails;
		this.clock = clock;
		this.zone = clock.getZone();
	}

	/** Your tasks from today on, unassigned tasks anyone can claim, and what you finished in the last two weeks. */
	@Transactional(readOnly = true)
	public MyTasks myTasks(Long studentId) {
		Student student = student(studentId);
		Instant today = LocalDate.now(clock).atStartOfDay(zone).toInstant();
		List<TaskResponse> upcoming = tasks.findForStudent(student, List.of(TaskStatus.ASSIGNED), today).stream()
				.map(workflow::describe).toList();
		List<Task> unassigned = tasks.findUnassignedFrom(today);
		List<TaskResponse> available = unassigned.stream().map(workflow::describe).toList();
		List<Long> duringMyShifts = unassigned.stream().filter(task -> assigner.isOnShiftForWholeTask(student, task))
				.map(Task::getId).toList();
		List<TaskResponse> recent = tasks.findForStudent(student, List.of(TaskStatus.COMPLETED, TaskStatus.NOT_COMPLETED),
				today.minusSeconds(14L * 24 * 3600)).stream()
				.sorted(Comparator.comparing(Task::getStartAt).reversed())
				.map(workflow::describe).toList();
		return new MyTasks(upcoming, available, duringMyShifts, recent);
	}

	/** The student's tasks (assigned or finished, not cancelled) starting from..to, campus dates, in time order. */
	@Transactional(readOnly = true)
	public List<TaskResponse> tasksBetween(Long studentId, LocalDate from, LocalDate to) {
		return tasks.findForStudent(student(studentId),
				List.of(TaskStatus.ASSIGNED, TaskStatus.COMPLETED, TaskStatus.NOT_COMPLETED), from.atStartOfDay(zone).toInstant())
				.stream()
				.filter(task -> task.getStartAt().isBefore(to.plusDays(1).atStartOfDay(zone).toInstant()))
				.map(workflow::describe)
				.toList();
	}

	/**
	 * Takes an unassigned task. Two students claiming at the same moment: the @Version column makes the
	 * second one fail (ApiExceptionHandler turns that into a clear 409).
	 */
	@Transactional
	public TaskResponse claim(Long taskId, Long studentId) {
		Student student = student(studentId);
		Task task = find(taskId);
		if (task.getStatus() != TaskStatus.UNASSIGNED) {
			throw new ConflictException("Someone already has this task.");
		}
		boolean onShift = assigner.isOnShiftForWholeTask(student, task);
		task.assignTo(student, !onShift);
		workflow.record(task, TaskEventType.CLAIMED, TaskWorkflow.name(student),
				onShift ? null : "Not on shift for the whole task");
		tasks.flush();
		return workflow.describe(task);
	}

	/** Gives the task back: the next eligible student gets it, otherwise it waits to be claimed. */
	@Transactional
	public TaskResponse optOut(Long taskId, Long studentId) {
		Task task = mine(taskId, studentId);
		Student student = task.getAssignee();
		task.unassign();
		workflow.record(task, TaskEventType.OPTED_OUT, TaskWorkflow.name(student), null);
		workflow.autoAssign(task, TaskWorkflow.SYSTEM, Set.of(studentId));
		return workflow.describe(task);
	}

	/** Colleagues who could take your task: on shift for all of it and free then. */
	@Transactional(readOnly = true)
	public List<Person> colleagues(Long taskId, Long studentId) {
		Task task = mine(taskId, studentId);
		return assigner.eligible(task, Set.of(studentId)).stream()
				.sorted(Comparator.comparing(Student::getLastName).thenComparing(Student::getFirstName))
				.map(s -> new Person(s.getId(), TaskWorkflow.name(s))).toList();
	}

	@Transactional
	public TaskResponse handOff(Long taskId, Long studentId, HandOffRequest request) {
		Task task = mine(taskId, studentId);
		Student from = task.getAssignee();
		Student to = assigner.eligible(task, Set.of(studentId)).stream()
				.filter(s -> s.getId().equals(request.studentId())).findFirst()
				.orElseThrow(() -> new ConflictException("That person isn't on shift for the whole task, or is busy then."));
		task.assignTo(to, false);
		workflow.record(task, TaskEventType.HANDED_OFF, TaskWorkflow.name(from), "To " + TaskWorkflow.name(to));
		emails.assigned(to, task);
		return workflow.describe(task);
	}

	/** Done: deducts the items really used; anything short is backordered for a follow-up. */
	@Transactional
	public TaskResponse complete(Long taskId, Long studentId, OutcomeRequest request) {
		Task task = mine(taskId, studentId);
		int backordered = reservations.fulfil(taskId, request.used() == null ? Map.of() : request.used(), task.getAssignee());
		task.complete(request.notes());
		workflow.record(task, TaskEventType.COMPLETED, TaskWorkflow.name(task.getAssignee()),
				backordered == 0 ? null : backordered + (backordered == 1 ? " item" : " items") + " backordered");
		return workflow.describe(task);
	}

	@Transactional
	public TaskResponse notCompleted(Long taskId, Long studentId, OutcomeRequest request) {
		Task task = mine(taskId, studentId);
		if (request.notes() == null || request.notes().isBlank()) {
			throw new ConflictException("Please say why the task couldn't be completed.");
		}
		reservations.release(taskId);
		task.notCompleted(request.notes());
		workflow.record(task, TaskEventType.NOT_COMPLETED, TaskWorkflow.name(task.getAssignee()), request.notes().trim());
		return workflow.describe(task);
	}

	private Task mine(Long taskId, Long studentId) {
		Task task = find(taskId);
		if (task.getStatus() != TaskStatus.ASSIGNED || !task.getAssignee().getId().equals(studentId)) {
			throw new ConflictException("This task isn't assigned to you.");
		}
		return task;
	}

	private Task find(Long id) {
		return tasks.findById(id).orElseThrow(() -> new NotFoundException("Task " + id + " not found."));
	}

	private Student student(Long id) {
		return students.findById(id).orElseThrow(() -> new NotFoundException("Student not found."));
	}

}
