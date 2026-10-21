package com.isandt.backend.calendar;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import jakarta.validation.Valid;

/** Admin portal: holidays. Admins only (/api/admin/**). */
@RestController
@RequestMapping("/api/admin/holidays")
public class HolidayController {

	private final HolidayService holidayService;

	HolidayController(HolidayService holidayService) {
		this.holidayService = holidayService;
	}

	@GetMapping
	List<HolidayResponse> list() {
		return holidayService.list();
	}

	@PostMapping
	HolidayChanges add(@Valid @RequestBody HolidayRequest request) {
		return holidayService.add(request);
	}

	/**
	 * A file upload arrives as "multipart/form-data" (like an HTML form with a file field), not JSON.
	 * Spring hands it over as a MultipartFile; files over 1 MB are refused by Spring's default limit.
	 */
	@PostMapping("/import")
	HolidayChanges importIcs(@RequestParam("file") MultipartFile file) throws IOException {
		return holidayService.importIcs(new String(file.getBytes(), StandardCharsets.UTF_8));
	}

	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void delete(@PathVariable Long id) {
		holidayService.delete(id);
	}

}
