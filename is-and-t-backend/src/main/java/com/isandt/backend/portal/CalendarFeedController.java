package com.isandt.backend.portal;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import com.isandt.backend.activity.Activity;
import com.isandt.backend.auth.AuthenticatedUser;
import com.isandt.backend.portal.CalendarFeedService.FeedLink;

/** The calendar subscription: students get their link; calendar apps fetch the feed with no login. */
@RestController
public class CalendarFeedController {

	private static final MediaType ICS = MediaType.parseMediaType("text/calendar;charset=UTF-8");

	private final CalendarFeedService service;

	CalendarFeedController(CalendarFeedService service) {
		this.service = service;
	}

	@GetMapping("/api/me/calendar")
	FeedLink link(@AuthenticationPrincipal AuthenticatedUser me) {
		return service.link(me.getId());
	}

	@Activity("Made a new calendar feed link")
	@PostMapping("/api/me/calendar/regenerate")
	FeedLink regenerate(@AuthenticationPrincipal AuthenticatedUser me) {
		return service.regenerate(me.getId());
	}

	/** Public (see SecurityConfig): the token in the URL is the only key. */
	@GetMapping("/api/calendar/{token}.ics")
	ResponseEntity<String> feed(@PathVariable String token) {
		return ResponseEntity.ok().contentType(ICS).body(service.feed(token));
	}

}
