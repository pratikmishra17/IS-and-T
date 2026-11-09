package com.isandt.backend.portal;

import java.time.LocalDate;
import java.util.List;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.isandt.backend.auth.AuthenticatedUser;
import com.isandt.backend.portal.PortalResponses.MyDay;
import com.isandt.backend.portal.PortalResponses.MyWeek;
import com.isandt.backend.portal.PortalResponses.StockLookup;
import com.isandt.backend.portal.PortalResponses.WeekHours;

/** User portal: the logged-in student's day and week. Students only (/api/me/**). */
@RestController
@RequestMapping("/api/me")
public class MyPortalController {

	private final MyPortalService service;

	MyPortalController(MyPortalService service) {
		this.service = service;
	}

	@GetMapping("/today")
	MyDay today(@AuthenticationPrincipal AuthenticatedUser me) {
		return service.today(me.getId());
	}

	/** GET /api/me/week?start=2026-10-19 (any day of that week); this week without start. */
	@GetMapping("/week")
	MyWeek week(@RequestParam(required = false) LocalDate start, @AuthenticationPrincipal AuthenticatedUser me) {
		return service.week(me.getId(), start);
	}

	/** Read-only: what's in stock and where. Changing stock stays in the admin portal. */
	@GetMapping("/inventory")
	List<StockLookup> inventory() {
		return service.stock();
	}

	@GetMapping("/schedule/hours")
	List<WeekHours> semesterHours(@RequestParam Long semesterId, @AuthenticationPrincipal AuthenticatedUser me) {
		return service.semesterHours(me.getId(), semesterId);
	}

}
