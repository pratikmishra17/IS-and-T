package com.isandt.backend.schedule;

import java.util.List;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.isandt.backend.activity.Activity;
import com.isandt.backend.auth.AuthenticatedUser;
import com.isandt.backend.calendar.SemesterResponse;
import com.isandt.backend.schedule.ScheduleResponses.StudentSchedule;

import jakarta.validation.Valid;

/** User portal: the logged-in student's own schedule. Students only (/api/me/**). */
@RestController
@RequestMapping("/api/me/schedule")
public class MyScheduleController {

	private final StudentScheduleService service;

	MyScheduleController(StudentScheduleService service) {
		this.service = service;
	}

	@GetMapping("/semesters")
	List<SemesterResponse> semesters() {
		return service.semesters();
	}

	@GetMapping
	StudentSchedule get(@RequestParam Long semesterId, @AuthenticationPrincipal AuthenticatedUser me) {
		return service.get(me.getId(), semesterId);
	}

	@Activity("Saved their class times and preferred hours")
	@PutMapping("/availability")
	StudentSchedule saveAvailability(@RequestParam Long semesterId, @Valid @RequestBody AvailabilityRequest request,
			@AuthenticationPrincipal AuthenticatedUser me) {
		return service.saveAvailability(me.getId(), semesterId, request);
	}

	@Activity("Sent their preferred hours for approval")
	@PostMapping("/submit")
	StudentSchedule submit(@RequestParam Long semesterId, @AuthenticationPrincipal AuthenticatedUser me) {
		return service.submit(me.getId(), semesterId);
	}

}
