package com.isandt.backend.task;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.isandt.backend.activity.Activity;
import com.isandt.backend.auth.AuthenticatedUser;
import com.isandt.backend.common.web.Saved;
import com.isandt.backend.inventory.CatalogService;
import com.isandt.backend.inventory.ItemResponse;
import com.isandt.backend.inventory.ItemService;
import com.isandt.backend.inventory.LocationResponse;
import com.isandt.backend.schedule.AdminScheduleService;
import com.isandt.backend.schedule.ScheduleResponses.Week;
import com.isandt.backend.settings.SettingsService;
import com.isandt.backend.task.TaskResponses.Candidate;
import com.isandt.backend.task.TaskResponses.TaskDetail;
import com.isandt.backend.task.TaskResponses.TaskResponse;
import com.isandt.backend.task.TeamTaskService.OfferResponse;
import com.isandt.backend.task.TeamTaskService.OfferResult;
import com.isandt.backend.task.TeamTaskService.TeamAccess;
import com.isandt.backend.user.TaskAccess;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

/**
 * Student portal: the Team page (/api/me/team, students only). Everyone's shifts and tasks for any
 * week or the semester; the rest depends on the student's access (TeamTaskService checks it).
 */
@RestController
@RequestMapping("/api/me/team")
class TeamController {

	private final TeamTaskService team;

	private final AdminScheduleService schedule;

	private final ItemService items;

	private final CatalogService catalog;

	private final SettingsService settings;

	TeamController(TeamTaskService team, AdminScheduleService schedule, ItemService items, CatalogService catalog,
			SettingsService settings) {
		this.team = team;
		this.schedule = schedule;
		this.items = items;
		this.catalog = catalog;
		this.settings = settings;
	}

	record OfferRequest(@Size(max = 500) String note) {
	}

	@GetMapping("/access")
	TeamAccess access(@AuthenticationPrincipal AuthenticatedUser me) {
		return team.access(me.getId());
	}

	/** Everyone's shifts, Monday to Sunday of the week containing date (this week if none). */
	@GetMapping("/week")
	Week week(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
		return schedule.week(date);
	}

	@GetMapping("/tasks")
	List<TaskResponse> tasks(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
		return team.list(from, to);
	}

	@GetMapping("/tasks/{id}")
	TaskDetail task(@PathVariable Long id) {
		return team.detail(id);
	}

	// ---- I can do this ----

	@Activity("Offered to take a task")
	@PostMapping("/tasks/{id}/offer")
	OfferResult offer(@PathVariable Long id, @Valid @RequestBody(required = false) OfferRequest request,
			@AuthenticationPrincipal AuthenticatedUser me) {
		return team.offer(id, me.getId(), request == null ? null : request.note());
	}

	@GetMapping("/offers")
	List<OfferResponse> myOffers(@AuthenticationPrincipal AuthenticatedUser me) {
		return team.myOffers(me.getId());
	}

	@Activity("Withdrew an offer to take a task")
	@PostMapping("/offers/{id}/withdraw")
	OfferResponse withdrawOffer(@PathVariable Long id, @AuthenticationPrincipal AuthenticatedUser me) {
		return team.withdrawOffer(id, me.getId());
	}

	// ---- Marking done (complete access, or their own task) ----

	@Activity("Marked a task done")
	@PostMapping("/tasks/{id}/complete")
	TaskResponse complete(@PathVariable Long id, @Valid @RequestBody OutcomeRequest request,
			@AuthenticationPrincipal AuthenticatedUser me) {
		return team.complete(id, me.getId(), request);
	}

	@Activity("Marked a task as couldn't be done")
	@PostMapping("/tasks/{id}/not-completed")
	TaskResponse notCompleted(@PathVariable Long id, @Valid @RequestBody OutcomeRequest request,
			@AuthenticationPrincipal AuthenticatedUser me) {
		return team.notCompleted(id, me.getId(), request);
	}

	// ---- Planning (edit access): the same requests as the admin Planner's ----

	@Activity("Created a task")
	@PostMapping("/tasks")
	@ResponseStatus(HttpStatus.CREATED)
	Saved<TaskResponse> create(@Valid @RequestBody TaskRequest request, @AuthenticationPrincipal AuthenticatedUser me) {
		return team.create(request, me.getId());
	}

	@Activity("Changed a task")
	@PutMapping("/tasks/{id}")
	Saved<TaskResponse> update(@PathVariable Long id, @Valid @RequestBody TaskRequest request,
			@AuthenticationPrincipal AuthenticatedUser me) {
		return team.update(id, request, me.getId());
	}

	@Activity("Cancelled a task")
	@PostMapping("/tasks/{id}/cancel")
	TaskResponse cancel(@PathVariable Long id, @AuthenticationPrincipal AuthenticatedUser me) {
		return team.cancel(id, me.getId());
	}

	@Activity("Assigned a task")
	@PostMapping("/tasks/{id}/assign")
	Saved<TaskResponse> assign(@PathVariable Long id, @RequestBody AssignRequest request,
			@AuthenticationPrincipal AuthenticatedUser me) {
		return team.assign(id, request, me.getId());
	}

	@GetMapping("/tasks/{id}/candidates")
	List<Candidate> candidates(@PathVariable Long id, @AuthenticationPrincipal AuthenticatedUser me) {
		return team.candidates(id, me.getId());
	}

	@GetMapping("/tasks/availability")
	List<Candidate> availability(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
			@RequestParam @DateTimeFormat(pattern = "HH:mm") LocalTime start, @RequestParam int minutes,
			@RequestParam(required = false) Long ignoreTaskId, @AuthenticationPrincipal AuthenticatedUser me) {
		return team.availability(date, start, minutes, ignoreTaskId, me.getId());
	}

	/** What the task form needs: items and where they're kept (edit access only). */
	@GetMapping("/items")
	List<ItemResponse> items(@AuthenticationPrincipal AuthenticatedUser me) {
		team.require(me.getId(), TaskAccess.EDIT);
		return items.list();
	}

	@GetMapping("/locations")
	List<LocationResponse> locations(@AuthenticationPrincipal AuthenticatedUser me) {
		team.require(me.getId(), TaskAccess.EDIT);
		return catalog.locations();
	}

	/** The task form's default length, from the admin settings. */
	@GetMapping("/task-defaults")
	Map<String, Integer> taskDefaults() {
		return Map.of("defaultTaskDuration", settings.get().defaultTaskDuration());
	}

}
