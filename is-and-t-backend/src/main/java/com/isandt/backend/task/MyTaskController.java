package com.isandt.backend.task;

import java.util.List;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.isandt.backend.activity.Activity;
import com.isandt.backend.auth.AuthenticatedUser;
import com.isandt.backend.task.TaskResponses.MyTasks;
import com.isandt.backend.task.TaskResponses.Person;
import com.isandt.backend.task.TaskResponses.TaskResponse;

import jakarta.validation.Valid;

/** User portal: the logged-in student's tasks. Students only (/api/me/**). */
@RestController
@RequestMapping("/api/me/tasks")
public class MyTaskController {

	private final StudentTaskService service;

	MyTaskController(StudentTaskService service) {
		this.service = service;
	}

	@GetMapping
	MyTasks myTasks(@AuthenticationPrincipal AuthenticatedUser me) {
		return service.myTasks(me.getId());
	}

	@Activity("Claimed a task")
	@PostMapping("/{id}/claim")
	TaskResponse claim(@PathVariable Long id, @AuthenticationPrincipal AuthenticatedUser me) {
		return service.claim(id, me.getId());
	}

	@Activity("Gave a task back")
	@PostMapping("/{id}/opt-out")
	TaskResponse optOut(@PathVariable Long id, @AuthenticationPrincipal AuthenticatedUser me) {
		return service.optOut(id, me.getId());
	}

	@GetMapping("/{id}/colleagues")
	List<Person> colleagues(@PathVariable Long id, @AuthenticationPrincipal AuthenticatedUser me) {
		return service.colleagues(id, me.getId());
	}

	@Activity("Handed a task to someone else")
	@PostMapping("/{id}/hand-off")
	TaskResponse handOff(@PathVariable Long id, @Valid @RequestBody HandOffRequest request,
			@AuthenticationPrincipal AuthenticatedUser me) {
		return service.handOff(id, me.getId(), request);
	}

	@Activity("Marked a task done")
	@PostMapping("/{id}/complete")
	TaskResponse complete(@PathVariable Long id, @Valid @RequestBody OutcomeRequest request,
			@AuthenticationPrincipal AuthenticatedUser me) {
		return service.complete(id, me.getId(), request);
	}

	@Activity("Marked a task as couldn't be done")
	@PostMapping("/{id}/not-completed")
	TaskResponse notCompleted(@PathVariable Long id, @Valid @RequestBody OutcomeRequest request,
			@AuthenticationPrincipal AuthenticatedUser me) {
		return service.notCompleted(id, me.getId(), request);
	}

}
