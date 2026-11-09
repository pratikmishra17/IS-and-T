package com.isandt.backend.schedule;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.isandt.backend.common.error.ConflictException;

class ShiftRulesTest {

	private static TimeBlock block(DayOfWeek day, String start, String end) {
		return new TimeBlock(day, LocalTime.parse(start), LocalTime.parse(end));
	}

	@Test
	void overlappingShiftsOnTheSameDayAreRefused() {
		List<TimeBlock> shifts = List.of(block(DayOfWeek.MONDAY, "09:00", "13:00"), block(DayOfWeek.MONDAY, "12:00", "14:00"));

		assertThatThrownBy(() -> ShiftRules.check(shifts, true, "Shift")).isInstanceOf(ConflictException.class)
			.hasMessageContaining("overlap");
	}

	@Test
	void backToBackShiftsAreFine() {
		List<TimeBlock> shifts = List.of(block(DayOfWeek.MONDAY, "09:00", "12:00"), block(DayOfWeek.MONDAY, "12:00", "14:00"));

		assertThatCode(() -> ShiftRules.check(shifts, true, "Shift")).doesNotThrowAnyException();
	}

	@Test
	void shiftsAreWeekdaysOnlyButClassesCanBeAnyDay() {
		List<TimeBlock> saturday = List.of(block(DayOfWeek.SATURDAY, "10:00", "12:00"));

		assertThatThrownBy(() -> ShiftRules.check(saturday, true, "Shift")).isInstanceOf(ConflictException.class);
		assertThatCode(() -> ShiftRules.check(saturday, false, "Class")).doesNotThrowAnyException();
	}

	@Test
	void hoursAddUpAcrossBlocks() {
		assertThat(ShiftRules.hours(List.of(block(DayOfWeek.MONDAY, "09:00", "13:00"), block(DayOfWeek.TUESDAY, "10:30", "12:00"))))
			.isEqualTo(5.5);
		assertThat(ShiftRules.formatHours(5.5)).isEqualTo("5.5");
		assertThat(ShiftRules.formatHours(20.0)).isEqualTo("20");
	}

}
