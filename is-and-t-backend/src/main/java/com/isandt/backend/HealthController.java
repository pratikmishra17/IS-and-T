package com.isandt.backend;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {

	private final JdbcTemplate jdbcTemplate;

	public HealthController(JdbcTemplate jdbcTemplate) {
		this.jdbcTemplate = jdbcTemplate;
	}

	@GetMapping("/api/health")
	public String health() {
		return "Connected to " + jdbcTemplate.queryForObject("SELECT current_database()", String.class);
	}

}
