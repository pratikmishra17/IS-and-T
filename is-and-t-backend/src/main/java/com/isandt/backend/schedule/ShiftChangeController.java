package com.isandt.backend.schedule;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.isandt.backend.activity.Activity;
import com.isandt.backend.auth.AuthenticatedUser;
import com.isandt.backend.schedule.ShiftChangeDtos.ChangeRequest;
import com.isandt.backend.schedule.ShiftChangeDtos.ChangeResponse;
import com.isandt.backend.schedule.ShiftChangeDtos.Review;

import jakarta.validation.Valid;

/**
 * Shift change requests. Students (/api/me/…) ask and can withdraw; admins (/api/admin/…) approve
 * or decline. Who may call which is decided by the path, in SecurityConfig.
 */
@RestController
class ShiftChangeController {

	private final ShiftChangeService service;

	ShiftChangeController(ShiftChangeService service) {
		this.service = service;
	}

	@GetMapping("/api/me/schedule/changes")
	List<ChangeResponse> mine(@AuthenticationPrincipal AuthenticatedUser me) {
		return service.mine(me.getId());
	}

	@Activity("Asked to change their shifts")
	@PostMapping("/api/me/schedule/changes")
	@ResponseStatus(HttpStatus.CREATED)
	ChangeResponse request(@Valid @RequestBody ChangeRequest request, @AuthenticationPrincipal AuthenticatedUser me) {
		return service.request(me.getId(), request);
	}

	@Activity("Withdrew a shift change request")
	@PostMapping("/api/me/schedule/changes/{id}/withdraw")
	ChangeResponse withdraw(@PathVariable Long id, @AuthenticationPrincipal AuthenticatedUser me) {
		return service.withdraw(id, me.getId());
	}

	@GetMapping("/api/admin/schedule/changes")
	List<ChangeResponse> pending() {
		return service.pending();
	}

	@Activity("Approved a shift change")
	@PostMapping("/api/admin/schedule/changes/{id}/approve")
	ChangeResponse approve(@PathVariable Long id, @Valid @RequestBody(required = false) Review review,
			@AuthenticationPrincipal AuthenticatedUser admin) {
		return service.approve(id, admin.getId(), review == null ? null : review.note());
	}

	@Activity("Declined a shift change")
	@PostMapping("/api/admin/schedule/changes/{id}/decline")
	ChangeResponse decline(@PathVariable Long id, @Valid @RequestBody(required = false) Review review,
			@AuthenticationPrincipal AuthenticatedUser admin) {
		return service.decline(id, admin.getId(), review == null ? null : review.note());
	}

}
