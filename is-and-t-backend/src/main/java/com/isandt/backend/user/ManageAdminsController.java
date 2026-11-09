package com.isandt.backend.user;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.isandt.backend.activity.Activity;
import com.isandt.backend.auth.AuthenticatedUser;

import jakarta.validation.Valid;

/** Admin portal: admin accounts. SecurityConfig restricts /api/admin/** to admins. */
@RestController
@RequestMapping("/api/admin/admins")
public class ManageAdminsController {

	private final AdminService adminService;

	ManageAdminsController(AdminService adminService) {
		this.adminService = adminService;
	}

	@GetMapping
	List<AccountResponse> list() {
		return adminService.list();
	}

	@Activity("Added an admin")
	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	AccountResponse create(@Valid @RequestBody AdminDetails details,
			@AuthenticationPrincipal AuthenticatedUser admin) {
		return adminService.create(details, admin.getId());
	}

	@Activity("Changed an admin's details")
	@PutMapping("/{id}")
	AccountResponse update(@PathVariable Long id, @Valid @RequestBody AdminDetails details) {
		return adminService.update(id, details);
	}

	/** Emails a set-password link again (for example, the first one expired). */
	@Activity("Sent an admin a set-password link")
	@PostMapping("/{id}/send-password-link")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void sendPasswordLink(@PathVariable Long id) {
		adminService.sendPasswordLink(id);
	}

	@Activity("Turned an admin account back on")
	@PostMapping("/{id}/enable")
	AccountResponse enable(@PathVariable Long id) {
		return adminService.enable(id);
	}

	@Activity("Turned off an admin account")
	@PostMapping("/{id}/disable")
	AccountResponse disable(@PathVariable Long id, @AuthenticationPrincipal AuthenticatedUser admin) {
		return adminService.disable(id, admin.getId());
	}

	@Activity("Deleted an admin")
	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void remove(@PathVariable Long id, @AuthenticationPrincipal AuthenticatedUser admin) {
		adminService.remove(id, admin.getId());
	}

}
