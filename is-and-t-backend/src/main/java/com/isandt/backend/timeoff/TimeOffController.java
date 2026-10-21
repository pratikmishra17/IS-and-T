package com.isandt.backend.timeoff;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.isandt.backend.auth.AuthenticatedUser;
import com.isandt.backend.common.web.Saved;

import jakarta.validation.Valid;

/**
 * Time off. Students use /api/me/time-off (their own requests); admins use /api/admin/time-off.
 * SecurityConfig decides who may call which, by the /api/me and /api/admin prefixes.
 */
@RestController
public class TimeOffController {

	private final TimeOffService service;

	TimeOffController(TimeOffService service) {
		this.service = service;
	}

	@PostMapping("/api/me/time-off")
	@ResponseStatus(HttpStatus.CREATED)
	TimeOffResponse request(@Valid @RequestBody TimeOffBody body, @AuthenticationPrincipal AuthenticatedUser me) {
		return service.request(me.getId(), body);
	}

	@GetMapping("/api/me/time-off")
	List<TimeOffResponse> mine(@AuthenticationPrincipal AuthenticatedUser me) {
		return service.mine(me.getId());
	}

	@PostMapping("/api/me/time-off/{id}/withdraw")
	TimeOffResponse withdraw(@PathVariable Long id, @AuthenticationPrincipal AuthenticatedUser me) {
		return service.withdraw(id, me.getId());
	}

	@GetMapping("/api/admin/time-off")
	List<TimeOffResponse> pending() {
		return service.pending();
	}

	@GetMapping("/api/admin/time-off/count")
	Map<String, Long> pendingCount() {
		return Map.of("pending", service.pendingCount());
	}

	@PostMapping("/api/admin/time-off/{id}/approve")
	Saved<TimeOffResponse> approve(@PathVariable Long id, @Valid @RequestBody(required = false) ReviewBody body,
			@AuthenticationPrincipal AuthenticatedUser admin) {
		return service.approve(id, admin.getId(), body);
	}

	@PostMapping("/api/admin/time-off/{id}/decline")
	TimeOffResponse decline(@PathVariable Long id, @Valid @RequestBody(required = false) ReviewBody body,
			@AuthenticationPrincipal AuthenticatedUser admin) {
		return service.decline(id, admin.getId(), body);
	}

}
