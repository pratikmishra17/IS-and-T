package com.isandt.backend.task;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonFormat;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.isandt.backend.activity.ActivityLog;
import com.isandt.backend.common.error.ConflictException;
import com.isandt.backend.common.error.ForbiddenException;
import com.isandt.backend.common.error.NotFoundException;
import com.isandt.backend.common.web.Saved;
import com.isandt.backend.inventory.ReservationService;
import com.isandt.backend.task.TaskResponses.Candidate;
import com.isandt.backend.task.TaskResponses.TaskDetail;
import com.isandt.backend.task.TaskResponses.TaskResponse;
import com.isandt.backend.user.AdminRepository;
import com.isandt.backend.user.Student;
import com.isandt.backend.user.StudentRepository;
import com.isandt.backend.user.TaskAccess;

/**
 * The student portal's Team page: every student sees the whole team's tasks; what else they may do
 * depends on the access an admin gave them (TaskAccess). Also the "I can do this" offers, from both
 * sides: students make them, admins accept or decline them.
 */
@Service
public class TeamTaskService {

	/** The most days one list may cover: a semester, with room to spare. */
	private static final long MAX_DAYS = 200;

	private final TaskRepository tasks;

	private final TaskOfferRepository offers;

	private final StudentRepository students;

	private final AdminRepository admins;

	private final AdminTaskService adminTasks;

	private final StudentTaskService studentTasks;

	private final ReservationService reservations;

	private final TaskWorkflow workflow;

	private final Clock clock;

	private final ZoneId zone;

	TeamTaskService(TaskRepository tasks, TaskOfferRepository offers, StudentRepository students, AdminRepository admins,
			AdminTaskService adminTasks, StudentTaskService studentTasks, ReservationService reservations,
			TaskWorkflow workflow, Clock clock) {
		this.tasks = tasks;
		this.offers = offers;
		this.students = students;
		this.admins = admins;
		this.adminTasks = adminTasks;
		this.studentTasks = studentTasks;
		this.reservations = reservations;
		this.workflow = workflow;
		this.clock = clock;
		this.zone = clock.getZone();
	}

	/** Who's looking, and what they may do. */
	public record TeamAccess(Long studentId, String name, TaskAccess access) {
	}

	/** An offer, with the task it's for and whether the student would be free then. */
	public record OfferResponse(Long id, Long taskId, String taskTitle, LocalDate date,
			@JsonFormat(pattern = "HH:mm") LocalTime startTime, @JsonFormat(pattern = "HH:mm") LocalTime endTime,
			String currentAssignee, Long studentId, String studentName, String note, TaskOffer.Status status,
			Instant createdAt, boolean available, String availabilityNote) {
	}

	/** What "I can do this" did: took the task straight away (it had nobody), or sent an offer to the admins. */
	public record OfferResult(boolean claimed, TaskResponse task, OfferResponse offer) {
	}

	@Transactional(readOnly = true)
	public TeamAccess access(Long studentId) {
		Student me = student(studentId);
		return new TeamAccess(me.getId(), TaskWorkflow.name(me), me.getTaskAccess());
	}

	// ---- Looking (everyone) ----

	@Transactional(readOnly = true)
	public List<TaskResponse> list(LocalDate from, LocalDate to) {
		if (to.isBefore(from) || ChronoUnit.DAYS.between(from, to) > MAX_DAYS) {
			throw new ConflictException("Pick at most " + MAX_DAYS + " days at a time.");
		}
		return adminTasks.list(from, to, null);
	}

	@Transactional(readOnly = true)
	public TaskDetail detail(Long taskId) {
		return adminTasks.detail(taskId);
	}

	// ---- "I can do this" (everyone) ----

	/** On a task nobody has, it's simply theirs (a claim); on someone else's, the admins get an offer. */
	@Transactional
	public OfferResult offer(Long taskId, Long studentId, String note) {
		Student me = student(studentId);
		Task task = find(taskId);
		task.requireOpen();
		ActivityLog.about(task.getTitle());
		if (task.getAssignee() != null && task.getAssignee().getId().equals(studentId)) {
			throw new ConflictException("This task is already yours.");
		}
		if (task.getStatus() == TaskStatus.UNASSIGNED) {
			return new OfferResult(true, studentTasks.claim(taskId, studentId), null);
		}
		if (offers.existsByTaskAndStudentAndStatus(task, me, TaskOffer.Status.PENDING)) {
			throw new ConflictException("You've already offered to take this task.");
		}
		TaskOffer offer = offers.save(new TaskOffer(task, me, note, Instant.now(clock)));
		return new OfferResult(false, workflow.describe(task), response(offer));
	}

	@Transactional
	public List<OfferResponse> myOffers(Long studentId) {
		closeStaleOffers();
		return offers.findTop50ByStudentOrderByCreatedAtDesc(student(studentId)).stream().map(this::response).toList();
	}

	@Transactional
	public OfferResponse withdrawOffer(Long offerId, Long studentId) {
		TaskOffer offer = offers.findById(offerId).filter(found -> found.getStudent().getId().equals(studentId))
				.orElseThrow(() -> new NotFoundException("Offer not found."));
		offer.close(TaskOffer.Status.WITHDRAWN, null, Instant.now(clock));
		ActivityLog.about(offer.getTask().getTitle());
		return response(offer);
	}

	// ---- Marking tasks done (COMPLETE and up, or the person who has it) ----

	@Transactional
	public TaskResponse complete(Long taskId, Long studentId, OutcomeRequest request) {
		return finish(taskId, studentId, request, true);
	}

	@Transactional
	public TaskResponse notCompleted(Long taskId, Long studentId, OutcomeRequest request) {
		if (request.notes() == null || request.notes().isBlank()) {
			throw new ConflictException("Please say why the task couldn't be completed.");
		}
		return finish(taskId, studentId, request, false);
	}

	/**
	 * Your own task goes the usual way. Someone else's stays theirs (the stock used is counted against
	 * them) and its history says who marked it; a task nobody had becomes yours.
	 */
	private TaskResponse finish(Long taskId, Long studentId, OutcomeRequest request, boolean done) {
		Task task = find(taskId);
		ActivityLog.about(task.getTitle());
		if (task.getAssignee() != null && task.getAssignee().getId().equals(studentId)) {
			return done ? studentTasks.complete(taskId, studentId, request) : studentTasks.notCompleted(taskId, studentId, request);
		}
		Student me = require(studentId, TaskAccess.COMPLETE);
		task.requireOpen();
		String detail;
		if (task.getAssignee() == null) {
			task.assignTo(me, false);
			detail = "It had nobody, so it's now " + me.getFirstName() + "'s";
		}
		else {
			detail = "For " + TaskWorkflow.name(task.getAssignee());
		}
		if (done) {
			int backordered = reservations.fulfil(taskId, task.getTitle(), request.used() == null ? Map.of() : request.used(), task.getAssignee());
			task.complete(request.notes());
			workflow.record(task, TaskEventType.COMPLETED, TaskWorkflow.name(me),
					detail + (backordered == 0 ? "" : "; " + backordered + (backordered == 1 ? " item" : " items") + " backordered"));
		}
		else {
			reservations.release(taskId);
			task.notCompleted(request.notes());
			workflow.record(task, TaskEventType.NOT_COMPLETED, TaskWorkflow.name(me), detail + ": " + request.notes().strip());
		}
		return workflow.describe(task);
	}

	// ---- Planning tasks (EDIT): the admin Planner's tools, as this student ----

	@Transactional
	public Saved<TaskResponse> create(TaskRequest request, Long studentId) {
		Student me = require(studentId, TaskAccess.EDIT);
		Saved<TaskResponse> saved = adminTasks.create(request, TaskWorkflow.name(me), null);
		ActivityLog.about(saved.result().title());
		return saved;
	}

	@Transactional
	public Saved<TaskResponse> update(Long taskId, TaskRequest request, Long studentId) {
		return adminTasks.update(taskId, request, TaskWorkflow.name(require(studentId, TaskAccess.EDIT)));
	}

	@Transactional
	public TaskResponse cancel(Long taskId, Long studentId) {
		return adminTasks.cancel(taskId, TaskWorkflow.name(require(studentId, TaskAccess.EDIT)));
	}

	@Transactional
	public Saved<TaskResponse> assign(Long taskId, AssignRequest request, Long studentId) {
		return adminTasks.assign(taskId, request, TaskWorkflow.name(require(studentId, TaskAccess.EDIT)));
	}

	@Transactional(readOnly = true)
	public List<Candidate> candidates(Long taskId, Long studentId) {
		require(studentId, TaskAccess.EDIT);
		return adminTasks.candidates(taskId);
	}

	@Transactional(readOnly = true)
	public List<Candidate> availability(LocalDate date, LocalTime start, int minutes, Long ignoreTaskId, Long studentId) {
		require(studentId, TaskAccess.EDIT);
		return adminTasks.availability(date, start, minutes, ignoreTaskId);
	}

	/** Throws unless this student has at least this access. */
	public Student require(Long studentId, TaskAccess needed) {
		Student me = student(studentId);
		if (!me.getTaskAccess().allows(needed)) {
			throw new ForbiddenException(needed == TaskAccess.EDIT
					? "You can look at tasks but not plan them. Ask an admin if you need to."
					: "You can look at tasks but not mark other people's done. Ask an admin if you need to.");
		}
		return me;
	}

	// ---- Admins: answering offers ----

	@Transactional
	public List<OfferResponse> pendingOffers() {
		closeStaleOffers();
		return offers.findByStatusOrderByCreatedAtAsc(TaskOffer.Status.PENDING).stream().map(this::response).toList();
	}

	/**
	 * Closes offers nobody needs to answer any more: their task was finished or cancelled, or it's
	 * already theirs. Tasks finish in many places (the student's Tasks page, the Team page, an admin
	 * cancelling, approved time off), so instead of each of those remembering, both offer lists
	 * tidy up here before they're shown.
	 */
	private void closeStaleOffers() {
		Instant now = Instant.now(clock);
		offers.findByStatusOrderByCreatedAtAsc(TaskOffer.Status.PENDING).stream().filter(TaskOffer::isStale)
				.forEach(offer -> offer.close(TaskOffer.Status.CLOSED, null, now));
	}

	/** The task becomes theirs; anyone else's offer for it is declined. */
	@Transactional
	public OfferResponse accept(Long offerId, Long adminId) {
		TaskOffer offer = offers.findById(offerId).orElseThrow(() -> new NotFoundException("Offer not found."));
		Instant now = Instant.now(clock);
		offer.close(TaskOffer.Status.ACCEPTED, admins.getReferenceById(adminId), now);
		adminTasks.assign(offer.getTask().getId(), new AssignRequest(offer.getStudent().getId()), adminId);
		offers.findByTaskAndStatus(offer.getTask(), TaskOffer.Status.PENDING)
				.forEach(other -> other.close(TaskOffer.Status.DECLINED, admins.getReferenceById(adminId), now));
		ActivityLog.about(offer.getTask().getTitle() + " → " + TaskWorkflow.name(offer.getStudent()));
		return response(offer);
	}

	@Transactional
	public OfferResponse decline(Long offerId, Long adminId) {
		TaskOffer offer = offers.findById(offerId).orElseThrow(() -> new NotFoundException("Offer not found."));
		offer.close(TaskOffer.Status.DECLINED, admins.getReferenceById(adminId), Instant.now(clock));
		ActivityLog.about(offer.getTask().getTitle() + " → " + TaskWorkflow.name(offer.getStudent()));
		return response(offer);
	}

	// ---- Helpers ----

	private OfferResponse response(TaskOffer offer) {
		Task task = offer.getTask();
		Student student = offer.getStudent();
		Candidate fit = offer.getStatus() == TaskOffer.Status.PENDING && task.getStatus().isOpen()
				? adminTasks.candidates(task.getId()).stream().filter(c -> c.id().equals(student.getId())).findFirst().orElse(null)
				: null;
		return new OfferResponse(offer.getId(), task.getId(), task.getTitle(), task.date(zone), task.startTime(zone),
				task.endTime(zone), task.getAssignee() == null ? null : TaskWorkflow.name(task.getAssignee()), student.getId(),
				TaskWorkflow.name(student), offer.getNote(), offer.getStatus(), offer.getCreatedAt(),
				fit != null && fit.eligible(), fit == null ? null : fit.note());
	}

	private Student student(Long id) {
		return students.findById(id).orElseThrow(() -> new NotFoundException("Student not found."));
	}

	private Task find(Long id) {
		return tasks.findById(id).orElseThrow(() -> new NotFoundException("Task " + id + " not found."));
	}

}
