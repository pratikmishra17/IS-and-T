package com.isandt.backend.activity;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Admin portal: the activity log (admins only, like everything under /api/admin). */
@RestController
@RequestMapping("/api/admin/activity")
class ActivityController {

	private final ActivityLog activity;

	ActivityController(ActivityLog activity) {
		this.activity = activity;
	}

	/** GET /api/admin/activity?q=sam&who=students&failed=true&page=0 */
	@GetMapping
	ActivityPage list(@RequestParam(defaultValue = "") String q, @RequestParam(defaultValue = "all") String who,
			@RequestParam(defaultValue = "false") boolean failed, @RequestParam(defaultValue = "0") int page) {
		return activity.search(q, who, failed, page);
	}

}
