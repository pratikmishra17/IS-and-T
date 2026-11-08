package com.isandt.backend.schedule;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.isandt.backend.calendar.Semester;
import com.isandt.backend.user.Student;

class KeptDaysTest {

	/** Wednesday, Nov 11 2026. */
	private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-11-11T15:00:00Z"), ZoneId.of("America/New_York"));

	private final KeptDayRepository kept = mock(KeptDayRepository.class);

	private final ShiftPatternRepository patterns = mock(ShiftPatternRepository.class);

	private final KeptDays keptDays = new KeptDays(kept, patterns, CLOCK);

	private final Student sam = new Student("sam@example.com", "Sam", "Lee", "S1", null);

	private final Semester fall = mock(Semester.class);

	private final List<KeptDay> saved = new ArrayList<>();

	KeptDaysTest() {
		when(fall.getStartDate()).thenReturn(LocalDate.of(2026, 11, 2)); // a short semester keeps the test small
		when(fall.getEndDate()).thenReturn(LocalDate.of(2026, 12, 18));
		when(patterns.findByStudentAndSemesterOrderByDayAscStartAsc(sam, fall)).thenReturn(List.of(
				new ShiftPattern(sam, fall, new TimeBlock(DayOfWeek.MONDAY, LocalTime.of(9, 0), LocalTime.of(13, 0))),
				new ShiftPattern(sam, fall, new TimeBlock(DayOfWeek.THURSDAY, LocalTime.of(9, 0), LocalTime.of(17, 0)))));
		when(kept.save(any())).thenAnswer(call -> {
			saved.add(call.getArgument(0));
			return call.getArgument(0);
		});
	}

	@Test
	void aWeeklyChangeKeepsThePastAndThatWeekdayUntilTheChangeStarts() {
		keptDays.beforeWeekdayChange(sam, fall, DayOfWeek.THURSDAY, LocalDate.of(2026, 11, 26));

		// Past weekdays: Nov 2-6 and Nov 9-10. Then the Thursdays before Nov 26: Nov 12 and Nov 19.
		assertThat(saved).extracting(KeptDay::getDate).containsExactly(
				LocalDate.of(2026, 11, 2), LocalDate.of(2026, 11, 3), LocalDate.of(2026, 11, 4), LocalDate.of(2026, 11, 5),
				LocalDate.of(2026, 11, 6), LocalDate.of(2026, 11, 9), LocalDate.of(2026, 11, 10),
				LocalDate.of(2026, 11, 12), LocalDate.of(2026, 11, 19));
		KeptDay thursday = saved.get(3);
		assertThat(thursday.getShifts()).hasSize(1);
		assertThat(thursday.getShifts().getFirst().start()).isEqualTo(LocalTime.of(9, 0));
		assertThat(saved.get(1).getShifts()).isEmpty(); // a Tuesday they didn't work is kept as "not working"
	}

	@Test
	void anAdminsNewWeekKeepsThePastAndDropsFutureKeptDays() {
		when(kept.findByStudentAndSemester(sam, fall)).thenReturn(List.of(new KeptDay(sam, fall, LocalDate.of(2026, 11, 2), List.of())));

		keptDays.beforeNewWeek(sam, fall);

		assertThat(saved).extracting(KeptDay::getDate).doesNotContain(LocalDate.of(2026, 11, 2)).contains(LocalDate.of(2026, 11, 10))
				.allMatch(date -> date.isBefore(LocalDate.of(2026, 11, 11)));
		verify(kept).deleteFrom(sam, fall, LocalDate.of(2026, 11, 11));
	}

}
