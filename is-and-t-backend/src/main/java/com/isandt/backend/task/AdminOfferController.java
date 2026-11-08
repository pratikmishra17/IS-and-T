package com.isandt.backend.task;

import java.util.List;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.isandt.backend.activity.Activity;
import com.isandt.backend.auth.AuthenticatedUser;
import com.isandt.backend.task.TeamTaskService.OfferResponse;

/** Admin portal: students' "I can do this" offers, waiting for an answer. */
@RestController
@RequestMapping("/api/admin/task-offers")
class AdminOfferController {

	private final TeamTaskService team;

	AdminOfferController(TeamTaskService team) {
		this.team = team;
	}

	@GetMapping
	List<OfferResponse> pending() {
		return team.pendingOffers();
	}

	@Activity("Accepted an offer to take a task")
	@PostMapping("/{id}/accept")
	OfferResponse accept(@PathVariable Long id, @AuthenticationPrincipal AuthenticatedUser admin) {
		return team.accept(id, admin.getId());
	}

	@Activity("Declined an offer to take a task")
	@PostMapping("/{id}/decline")
	OfferResponse decline(@PathVariable Long id, @AuthenticationPrincipal AuthenticatedUser admin) {
		return team.decline(id, admin.getId());
	}

}
