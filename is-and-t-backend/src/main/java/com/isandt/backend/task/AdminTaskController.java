package com.isandt.backend.task;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

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

import com.isandt.backend.auth.AuthenticatedUser;
import com.isandt.backend.common.web.Saved;
import com.isandt.backend.task.TaskResponses.Backorder;
import com.isandt.backend.task.TaskResponses.Candidate;
import com.isandt.backend.task.TaskResponses.TaskDetail;
import com.isandt.backend.task.TaskResponses.TaskResponse;

import jakarta.validation.Valid;

/** Admin portal: tasks. Admins only (/api/admin/**). */
@RestController
@RequestMapping("/api/admin/tasks")
public class AdminTaskController {

	private final AdminTaskService service;

	AdminTaskController(AdminTaskService service) {
		this.service = service;
	}

	/** GET /api/admin/tasks?from=2026-10-19&to=2026-10-23[&status=UNASSIGNED] */
	@GetMapping
	List<TaskResponse> list(@RequestParam LocalDate from, @RequestParam LocalDate to,
			@RequestParam(required = false) TaskStatus status) {
		return service.list(from, to, status);
	}

	@GetMapping("/{id}")
	TaskDetail detail(@PathVariable Long id) {
		return service.detail(id);
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	Saved<TaskResponse> create(@Valid @RequestBody TaskRequest request, @AuthenticationPrincipal AuthenticatedUser admin) {
		return service.create(request, admin.getId());
	}

	@PutMapping("/{id}")
	Saved<TaskResponse> update(@PathVariable Long id, @Valid @RequestBody TaskRequest request,
			@AuthenticationPrincipal AuthenticatedUser admin) {
		return service.update(id, request, admin.getId());
	}

	@PostMapping("/{id}/cancel")
	TaskResponse cancel(@PathVariable Long id, @AuthenticationPrincipal AuthenticatedUser admin) {
		return service.cancel(id, admin.getId());
	}

	/** GET /api/admin/tasks/availability?date=2026-10-27&start=10:00&minutes=30: who'd be free then, for a new task. */
	@GetMapping("/availability")
	List<Candidate> availability(@RequestParam LocalDate date, @RequestParam @DateTimeFormat(pattern = "HH:mm") LocalTime start,
			@RequestParam int minutes, @RequestParam(required = false) Long ignoreTaskId) {
		return service.availability(date, start, Math.max(5, Math.min(600, minutes)), ignoreTaskId);
	}

	@GetMapping("/{id}/candidates")
	List<Candidate> candidates(@PathVariable Long id) {
		return service.candidates(id);
	}

	@PostMapping("/{id}/assign")
	Saved<TaskResponse> assign(@PathVariable Long id, @RequestBody AssignRequest request,
			@AuthenticationPrincipal AuthenticatedUser admin) {
		return service.assign(id, request, admin.getId());
	}

	@GetMapping("/backorders")
	List<Backorder> backorders() {
		return service.backorders();
	}

}
