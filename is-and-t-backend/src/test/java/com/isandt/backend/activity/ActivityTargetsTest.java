package com.isandt.backend.activity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;

class ActivityTargetsTest {

	record Task(Long id, String title, String location) {
	}

	record Saved(Task result, List<String> warnings) {
	}

	record Person(Long id, String firstName, String lastName, String email) {
	}

	record TimeOff(Long id, String studentName, LocalDate date) {
	}

	record Nothing(int count) {
	}

	@Test
	void namesWhatARequestActedOnFromItsResponse() {
		assertThat(ActivityTargets.nameOf(new Task(1L, "Printer offline", "BU 201"))).isEqualTo("Printer offline");
		assertThat(ActivityTargets.nameOf(new Saved(new Task(1L, "Dock setup", "BU 1"), List.of()))).isEqualTo("Dock setup");
		assertThat(ActivityTargets.nameOf(new Person(2L, "Sam", "Lee", "sam@csuohio.edu"))).isEqualTo("Sam Lee");
		assertThat(ActivityTargets.nameOf(new TimeOff(3L, "Sam Lee", LocalDate.of(2026, 10, 20)))).isEqualTo("Sam Lee, Tue, Oct 20");
		assertThat(ActivityTargets.nameOf(new Nothing(4))).isNull();
		assertThat(ActivityTargets.nameOf(List.of("not a record"))).isNull();
		assertThat(ActivityTargets.nameOf(null)).isNull();
	}

}
