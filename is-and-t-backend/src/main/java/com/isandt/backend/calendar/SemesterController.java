package com.isandt.backend.calendar;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;

import com.isandt.backend.activity.Activity;

/** Admin portal: semesters. Admins only (/api/admin/**). */
@RestController
@RequestMapping("/api/admin/semesters")
public class SemesterController {

	private final SemesterService semesterService;

	SemesterController(SemesterService semesterService) {
		this.semesterService = semesterService;
	}

	@GetMapping
	List<SemesterResponse> list() {
		return semesterService.list();
	}

	@Activity("Added a semester")
	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	SemesterResponse create(@Valid @RequestBody SemesterDetails details) {
		return semesterService.create(details);
	}

	@Activity("Changed a semester")
	@PutMapping("/{id}")
	SemesterResponse update(@PathVariable Long id, @Valid @RequestBody SemesterDetails details) {
		return semesterService.update(id, details);
	}

	@Activity("Deleted a semester")
	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void delete(@PathVariable Long id) {
		semesterService.delete(id);
	}

}
