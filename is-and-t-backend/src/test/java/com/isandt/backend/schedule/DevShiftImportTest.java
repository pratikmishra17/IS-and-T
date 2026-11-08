package com.isandt.backend.schedule;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.DayOfWeek;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

class DevShiftImportTest {

	private static Map<String, List<TimeBlock>> sheet() throws IOException {
		return DevShiftImport.read(new ClassPathResource("dev-data/weekly-shifts.csv").getContentAsString(StandardCharsets.UTF_8));
	}

	private static double hours(Map<String, List<TimeBlock>> shifts, String name, DayOfWeek day) {
		return ShiftRules.hours(shifts.get(name).stream().filter(block -> block.day() == day).toList());
	}

	@Test
	void theShiftFileMatchesTheHoursColumnOfTheSheet() throws IOException {
		Map<String, List<TimeBlock>> shifts = sheet();

		assertThat(shifts).containsOnlyKeys("Hetvi", "Alister", "Pratik", "Grace", "Alex", "Oskar", "Adam C");
		// Every hour total the sheet gives, day by day
		assertThat(hours(shifts, "Alister", DayOfWeek.MONDAY)).isEqualTo(3);
		assertThat(hours(shifts, "Pratik", DayOfWeek.MONDAY)).isEqualTo(6.5);
		assertThat(hours(shifts, "Grace", DayOfWeek.MONDAY)).isEqualTo(4.5);
		assertThat(hours(shifts, "Oskar", DayOfWeek.MONDAY)).isEqualTo(2.5);
		assertThat(hours(shifts, "Adam C", DayOfWeek.MONDAY)).isEqualTo(4);
		assertThat(hours(shifts, "Pratik", DayOfWeek.TUESDAY)).isEqualTo(4);
		assertThat(hours(shifts, "Grace", DayOfWeek.TUESDAY)).isEqualTo(2.5);
		assertThat(hours(shifts, "Oskar", DayOfWeek.TUESDAY)).isEqualTo(5);
		assertThat(hours(shifts, "Pratik", DayOfWeek.WEDNESDAY)).isEqualTo(2);
		assertThat(hours(shifts, "Grace", DayOfWeek.WEDNESDAY)).isEqualTo(4.5);
		assertThat(hours(shifts, "Oskar", DayOfWeek.WEDNESDAY)).isEqualTo(2.5);
		assertThat(hours(shifts, "Grace", DayOfWeek.THURSDAY)).isEqualTo(2.5);
		assertThat(hours(shifts, "Oskar", DayOfWeek.THURSDAY)).isEqualTo(5);
		assertThat(hours(shifts, "Adam C", DayOfWeek.THURSDAY)).isEqualTo(7);
		assertThat(hours(shifts, "Grace", DayOfWeek.FRIDAY)).isEqualTo(6);
		assertThat(hours(shifts, "Oskar", DayOfWeek.FRIDAY)).isEqualTo(2.5);
		// And every student's shifts pass the same rules as the admin portal (weekdays, no overlaps)
		shifts.forEach((name, blocks) -> ShiftRules.check(blocks, true, name));
	}

	@Test
	void readsLinesAndSkipsCommentsAndBlankLines() {
		Map<String, List<TimeBlock>> shifts = DevShiftImport.read("""
				# a comment

				Sam, monday, 09:00, 12:00
				Sam,FRIDAY,13:00,15:30
				""");

		assertThat(shifts.get("Sam")).extracting(TimeBlock::describe)
				.containsExactly("Monday 09:00–12:00", "Friday 13:00–15:30");
	}

	@Test
	void saysWhichLineCantBeRead() {
		assertThatThrownBy(() -> DevShiftImport.read("Sam,MONDAY,09:00\n")).hasMessageContaining("line 1");
		assertThatThrownBy(() -> DevShiftImport.read("# x\nSam,MONDAY,9am,12:00\n")).hasMessageContaining("line 2");
	}

	@Test
	void findsStudentsByFirstNameAndAnOptionalLastInitial() {
		assertThat(DevShiftImport.matches("Hetvi", "hetvi", "Patel")).isTrue();
		assertThat(DevShiftImport.matches("Adam C", "Adam", "Cruz")).isTrue();
		assertThat(DevShiftImport.matches("Adam C", "Adam", "Miller")).isFalse();
		assertThat(DevShiftImport.matches("Alex", "Alexander", "Smith")).isFalse();
	}

}
