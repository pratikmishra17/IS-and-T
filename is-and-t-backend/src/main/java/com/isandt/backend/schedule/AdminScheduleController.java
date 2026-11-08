package com.isandt.backend.schedule;

import java.time.LocalDate;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.isandt.backend.activity.Activity;
import com.isandt.backend.auth.AuthenticatedUser;
import com.isandt.backend.schedule.ScheduleResponses.ExceptionInfo;
import com.isandt.backend.schedule.ScheduleResponses.PendingRequest;
import com.isandt.backend.schedule.ScheduleResponses.SemesterUsage;
import com.isandt.backend.common.web.Saved;
import com.isandt.backend.schedule.ScheduleResponses.StudentSchedule;
import com.isandt.backend.schedule.ScheduleResponses.Week;

import jakarta.validation.Valid;

/** Admin portal: schedules. Admins only (/api/admin/**). */
@RestController
@RequestMapping("/api/admin/schedule")
public class AdminScheduleController {

	private final AdminScheduleService service;

	AdminScheduleController(AdminScheduleService service) {
		this.service = service;
	}

	@GetMapping("/requests")
	List<PendingRequest> pendingRequests() {
		return service.pendingRequests();
	}

	/** GET /semesters/5/usage: what deleting that semester would also delete. */
	@GetMapping("/semesters/{semesterId}/usage")
	SemesterUsage semesterUsage(@PathVariable Long semesterId) {
		return service.semesterUsage(semesterId);
	}

	@GetMapping("/students/{studentId}")
	StudentSchedule studentSchedule(@PathVariable Long studentId, @RequestParam Long semesterId) {
		return service.studentSchedule(studentId, semesterId);
	}

	@Activity("Set a student's weekly shifts")
	@PutMapping("/students/{studentId}/shifts")
	Saved<StudentSchedule> setShifts(@PathVariable Long studentId, @RequestParam Long semesterId,
			@Valid @RequestBody ShiftsRequest request, @AuthenticationPrincipal AuthenticatedUser admin) {
		return service.setShifts(studentId, semesterId, request, admin.getId());
	}

	@Activity("Changed a student's shifts for one day")
	@PostMapping("/students/{studentId}/exceptions")
	Saved<ExceptionInfo> addException(@PathVariable Long studentId, @Valid @RequestBody ExceptionRequest request,
			@AuthenticationPrincipal AuthenticatedUser admin) {
		return service.addException(studentId, request, admin.getId());
	}

	@Activity("Removed a one-day shift change")
	@DeleteMapping("/exceptions/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void deleteException(@PathVariable Long id) {
		service.deleteException(id);
	}

	/** GET /week?start=2026-10-19 (any day of that week); without start, this week. */
	@GetMapping("/week")
	Week week(@RequestParam(required = false) LocalDate start) {
		return service.week(start);
	}

}
