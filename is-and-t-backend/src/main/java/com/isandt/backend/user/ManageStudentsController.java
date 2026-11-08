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

/** Admin portal: student accounts. SecurityConfig restricts /api/admin/** to admins. */
@RestController
@RequestMapping("/api/admin/students")
public class ManageStudentsController {

	private final StudentService studentService;

	ManageStudentsController(StudentService studentService) {
		this.studentService = studentService;
	}

	@GetMapping
	List<AccountResponse> list() {
		return studentService.list();
	}

	@Activity("Added a student")
	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	AccountResponse create(@Valid @RequestBody StudentDetails details,
			@AuthenticationPrincipal AuthenticatedUser admin) {
		return studentService.create(details, admin.getId());
	}

	@Activity("Changed a student's details")
	@PutMapping("/{id}")
	AccountResponse update(@PathVariable Long id, @Valid @RequestBody StudentDetails details) {
		return studentService.update(id, details);
	}

	/** Emails a set-password link again (for example, the first one expired). */
	@Activity("Sent a student a set-password link")
	@PostMapping("/{id}/send-password-link")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void sendPasswordLink(@PathVariable Long id) {
		studentService.sendPasswordLink(id);
	}

	/** Body: {"access": "VIEW" | "COMPLETE" | "EDIT"} */
	@Activity("Changed what a student may do with tasks")
	@PutMapping("/{id}/task-access")
	AccountResponse changeTaskAccess(@PathVariable Long id, @Valid @RequestBody TaskAccessRequest request) {
		return studentService.changeTaskAccess(id, request.access());
	}

	@Activity("Turned a student account back on")
	@PostMapping("/{id}/enable")
	AccountResponse enable(@PathVariable Long id) {
		return studentService.enable(id);
	}

	@Activity("Turned off a student account")
	@PostMapping("/{id}/disable")
	AccountResponse disable(@PathVariable Long id) {
		return studentService.disable(id);
	}

	@Activity("Deleted a student")
	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void remove(@PathVariable Long id) {
		studentService.remove(id);
	}

}
