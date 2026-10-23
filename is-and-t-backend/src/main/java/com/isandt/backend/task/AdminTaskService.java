package com.isandt.backend.task;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.isandt.backend.calendar.HolidayService;
import com.isandt.backend.common.error.NotFoundException;
import com.isandt.backend.common.web.Saved;
import com.isandt.backend.inventory.PlannedItemResponse;
import com.isandt.backend.inventory.ReservationService;
import com.isandt.backend.task.TaskResponses.Backorder;
import com.isandt.backend.task.TaskResponses.Candidate;
import com.isandt.backend.task.TaskResponses.EventResponse;
import com.isandt.backend.task.TaskResponses.TaskDetail;
import com.isandt.backend.task.TaskResponses.TaskResponse;
import com.isandt.backend.user.Admin;
import com.isandt.backend.user.AdminRepository;
import com.isandt.backend.user.Student;
import com.isandt.backend.user.StudentRepository;

/** What admins do with tasks: plan, change, assign and cancel them, and follow up on backorders. */
@Service
public class AdminTaskService {

	private final TaskRepository tasks;

	private final TaskEventRepository events;

	private final AdminRepository admins;

	private final StudentRepository students;

	private final ReservationService reservations;

	private final HolidayService holidays;

	private final TaskAssigner assigner;

	private final TaskWorkflow workflow;

	private final TaskEmails emails;

	private final Clock clock;

	private final ZoneId zone;

	AdminTaskService(TaskRepository tasks, TaskEventRepository events, AdminRepository admins, StudentRepository students,
			ReservationService reservations, HolidayService holidays, TaskAssigner assigner, TaskWorkflow workflow,
			TaskEmails emails, Clock clock) {
		this.tasks = tasks;
		this.events = events;
		this.admins = admins;
		this.students = students;
		this.reservations = reservations;
		this.holidays = holidays;
		this.assigner = assigner;
		this.workflow = workflow;
		this.emails = emails;
		this.clock = clock;
		this.zone = clock.getZone();
	}

	/** Tasks starting from..to (inclusive, campus dates), optionally only one status. */
	@Transactional(readOnly = true)
	public List<TaskResponse> list(LocalDate from, LocalDate to, TaskStatus status) {
		List<Task> found = tasks.findStartingBetween(from.atStartOfDay(zone).toInstant(),
				to.plusDays(1).atStartOfDay(zone).toInstant()).stream()
				.filter(task -> status == null || task.getStatus() == status)
				.toList();
		Map<Long, List<PlannedItemResponse>> items = reservations.forTasks(found.stream().map(Task::getId).toList());
		return found.stream().map(task -> TaskResponse.from(task, zone, items.getOrDefault(task.getId(), List.of()))).toList();
	}

	@Transactional(readOnly = true)
	public TaskDetail detail(Long id) {
		Task task = find(id);
		return new TaskDetail(workflow.describe(task),
				events.findByTaskOrderByOccurredAtAscIdAsc(task).stream().map(EventResponse::from).toList());
	}

	@Transactional
	public Saved<TaskResponse> create(TaskRequest request, Long adminId) {
		String actor = adminName(adminId);
		Task task = tasks.save(new Task(request, zone, admins.getReferenceById(adminId)));
		List<String> warnings = new ArrayList<>(reservations.reserve(task.getId(), request.items()));
		if (request.parentTaskId() != null) {
			Task parent = find(request.parentTaskId());
			reservations.resolveBackorders(parent.getId());
			workflow.record(parent, TaskEventType.EDITED, actor, "Follow-up deployment #" + task.getId() + " created for the backordered items");
		}
		workflow.record(task, TaskEventType.CREATED, actor,
				request.parentTaskId() == null ? null : "Follow-up of task #" + request.parentTaskId());
		warnings.addAll(dateWarnings(task));
		if (request.assignAutomatically()) {
			workflow.autoAssign(task, actor, Set.of()).ifPresent(warnings::add);
		}
		return new Saved<>(workflow.describe(task), warnings);
	}

	/** Edits a task; if its time changed and the assignee can't make the new time, someone else gets it. */
	@Transactional
	public Saved<TaskResponse> update(Long id, TaskRequest request, Long adminId) {
		String actor = adminName(adminId);
		Task task = find(id);
		task.requireOpen();
		Instant oldStart = task.getStartAt();
		int oldDuration = task.getDurationMinutes();
		task.update(request, zone);
		boolean rescheduled = !oldStart.equals(task.getStartAt()) || oldDuration != task.getDurationMinutes();
		workflow.record(task, rescheduled ? TaskEventType.RESCHEDULED : TaskEventType.EDITED, actor,
				rescheduled ? "Now " + task.date(zone) + " " + task.startTime(zone) + "–" + task.endTime(zone) : null);

		List<String> warnings = new ArrayList<>(reservations.reserve(task.getId(), request.items()));
		warnings.addAll(dateWarnings(task));
		if (rescheduled) {
			Student assignee = task.getAssignee();
			if (assignee == null) {
				workflow.autoAssign(task, actor, Set.of()).ifPresent(warnings::add);
			}
			else if (assigner.eligible(task, Set.of()).stream().anyMatch(s -> s.getId().equals(assignee.getId()))) {
				emails.rescheduled(assignee, task);
			}
			else {
				workflow.reassign(task, actor, "it was moved to a time they're not working or are busy");
			}
		}
		return new Saved<>(workflow.describe(task), warnings);
	}

	@Transactional
	public TaskResponse cancel(Long id, Long adminId) {
		Task task = find(id);
		Student assignee = task.getAssignee();
		task.cancel();
		reservations.release(id);
		workflow.record(task, TaskEventType.CANCELLED, adminName(adminId), null);
		if (assignee != null) {
			emails.cancelled(assignee, task);
		}
		return workflow.describe(task);
	}

	/** Everyone who could be given the task; eligible ones (on shift and free) first. */
	@Transactional(readOnly = true)
	public List<Candidate> candidates(Long id) {
		Task task = find(id);
		Set<Long> eligible = assigner.eligible(task, Set.of()).stream().map(Student::getId).collect(Collectors.toSet());
		return students.findAllByOrderByLastNameAscFirstNameAsc().stream()
				.filter(s -> s.isActive() && s.getPasswordHash() != null)
				.map(s -> new Candidate(s.getId(), TaskWorkflow.name(s), eligible.contains(s.getId())))
				.sorted(Comparator.comparing(Candidate::eligible).reversed())
				.toList();
	}

	/** An admin's choice wins, even for someone not on shift; that only produces a warning. */
	@Transactional
	public Saved<TaskResponse> assign(Long id, AssignRequest request, Long adminId) {
		String actor = adminName(adminId);
		Task task = find(id);
		task.requireOpen();
		Student previous = task.getAssignee();
		List<String> warnings = new ArrayList<>();

		if (request.studentId() == null) {
			if (previous != null) {
				task.unassign();
				workflow.record(task, TaskEventType.UNASSIGNED, actor, "Taken off " + TaskWorkflow.name(previous));
				emails.removed(previous, task, "an admin unassigned it");
			}
			return new Saved<>(workflow.describe(task), warnings);
		}
		Student student = students.findById(request.studentId()).orElseThrow(() -> new NotFoundException("Student not found."));
		if (previous != null && previous.getId().equals(student.getId())) {
			return new Saved<>(workflow.describe(task), warnings);
		}
		boolean eligible = assigner.eligible(task, Set.of()).stream().anyMatch(s -> s.getId().equals(student.getId()));
		task.assignTo(student, false);
		workflow.record(task, TaskEventType.ASSIGNED, actor, "Assigned to " + TaskWorkflow.name(student)
				+ (eligible ? "" : " (not on shift for the whole task, or busy then)"));
		emails.assigned(student, task);
		if (previous != null) {
			emails.removed(previous, task, "an admin gave it to someone else");
		}
		if (!eligible) {
			warnings.add(student.getFirstName() + " isn't on shift for the whole task, or has another task then.");
		}
		return new Saved<>(workflow.describe(task), warnings);
	}

	/** Items completed deployments still owe, with the task that owes them. */
	@Transactional(readOnly = true)
	public List<Backorder> backorders() {
		var lines = reservations.backorders();
		Map<Long, Task> byId = tasks.findAllById(lines.stream().map(b -> b.taskId()).collect(Collectors.toSet())).stream()
				.collect(Collectors.toMap(Task::getId, Function.identity()));
		return lines.stream()
				.filter(line -> byId.containsKey(line.taskId()))
				.map(line -> new Backorder(line.plannedItemId(), line.itemName(), line.locationLabel(), line.missing(),
						line.availableNow(), workflow.describe(byId.get(line.taskId()))))
				.toList();
	}

	private List<String> dateWarnings(Task task) {
		List<String> warnings = new ArrayList<>();
		LocalDate date = task.date(zone);
		if (date.getDayOfWeek() == DayOfWeek.SATURDAY || date.getDayOfWeek() == DayOfWeek.SUNDAY) {
			warnings.add("That's a weekend; nobody has shifts then.");
		}
		String holiday = holidays.namesBetween(date, date).get(date);
		if (holiday != null) {
			warnings.add(date + " is a holiday (" + holiday + ").");
		}
		if (task.getStartAt().isBefore(Instant.now(clock))) {
			warnings.add("This task starts in the past.");
		}
		if (!task.endsSameDay(zone)) {
			warnings.add("This task runs past midnight, so nobody can be on shift for all of it.");
		}
		return warnings;
	}

	private String adminName(Long adminId) {
		Admin admin = admins.findById(adminId).orElseThrow(() -> new NotFoundException("Admin not found."));
		return admin.getFirstName() + " " + admin.getLastName();
	}

	private Task find(Long id) {
		return tasks.findById(id).orElseThrow(() -> new NotFoundException("Task " + id + " not found."));
	}

}
