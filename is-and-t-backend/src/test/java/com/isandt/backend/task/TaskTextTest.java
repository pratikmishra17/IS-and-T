package com.isandt.backend.task;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.isandt.backend.task.TaskResponses.SupplyResponse;

class TaskTextTest {

	@Test
	void employeeLeavesOutWhatWasntGiven() {
		assertThat(TaskText.employee("Pat Doe", null, "216-555-0100")).isEqualTo("Pat Doe, 216-555-0100");
		assertThat(TaskText.employee(null, " ", null)).isNull();
	}

	@Test
	void suppliesShowQuantitiesOverOne() {
		assertThat(TaskText.supplies(List.of(new SupplyResponse("Dual Monitors", 2), new SupplyResponse("Webcam", 1))))
			.isEqualTo("2 × Dual Monitors, Webcam");
		assertThat(TaskText.supplies(List.of())).isNull();
	}

}
