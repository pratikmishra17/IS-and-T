package com.isandt.backend.schedule;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import com.isandt.backend.calendar.HolidayService;
import com.isandt.backend.calendar.Semester;
import com.isandt.backend.calendar.SemesterService;
import com.isandt.backend.user.Student;

class ShiftCalendarTest {

	private final SemesterService semesters = mock(SemesterService.class);

	private final ShiftPatternRepository patterns = mock(ShiftPatternRepository.class);

	private final ShiftExceptionRepository exceptions = mock(ShiftExceptionRepository.class);

	private final KeptDayRepository kept = mock(KeptDayRepository.class);

	private final HolidayService holidays = mock(HolidayService.class);

	private final ShiftCalendar calendar = new ShiftCalendar(semesters, patterns, exceptions, kept, holidays);

	private final Student sam = withId(new Student("sam@example.com", "Sam", "Student", "2001", null), 7L);

	/** Mondays in this test: 19 Oct 2026 (normal), 26 Oct 2026 (day off + extra shift). */
	private final LocalDate monday = LocalDate.of(2026, 10, 19);

	private final LocalDate nextMonday = LocalDate.of(2026, 10, 26);

	@BeforeEach
	void samWorksMondayMorningsInFall() {
		Semester fall = mock(Semester.class);
		when(fall.getId()).thenReturn(1L);
		when(fall.contains(any())).thenReturn(true);
		when(semesters.overlapping(any(), any())).thenReturn(List.of(fall));
		when(patterns.findBySemesterIn(any())).thenReturn(List.of(
				new ShiftPattern(sam, fall, new TimeBlock(DayOfWeek.MONDAY, LocalTime.of(9, 0), LocalTime.of(13, 0)))));
		when(exceptions.findByDateBetween(any(), any())).thenReturn(List.of(
				new ShiftException(sam, new ExceptionRequest(nextMonday, ShiftExceptionType.CANCEL, null, null, "Exam"), null),
				new ShiftException(sam, new ExceptionRequest(nextMonday, ShiftExceptionType.EXTRA, LocalTime.of(15, 0), LocalTime.of(17, 0), null), null)));
	}

	@Test
	void theWeeklyShiftAppliesOnItsWeekday() {
		ShiftCalendar.Day day = calendar.on(7L, monday);

		assertThat(day.shifts()).containsExactly(new ShiftCalendar.Shift(LocalTime.of(9, 0), LocalTime.of(13, 0), false));
		assertThat(day.cancelled()).isFalse();
	}

	@Test
	void aDayOffRemovesTheWeeklyShiftButKeepsAnExtraShift() {
		ShiftCalendar.Day day = calendar.on(7L, nextMonday);

		assertThat(day.cancelled()).isTrue();
		assertThat(day.shifts()).containsExactly(new ShiftCalendar.Shift(LocalTime.of(15, 0), LocalTime.of(17, 0), true));
	}

	@Test
	void aKeptDayUsesTheShiftsSavedForItInsteadOfTheWeeklyPattern() {
		Semester fall = mock(Semester.class);
		when(kept.findByDateBetween(any(), any())).thenReturn(List.of(new KeptDay(sam, fall, monday,
				List.of(new TimeBlock(DayOfWeek.MONDAY, LocalTime.of(12, 0), LocalTime.of(16, 0))))));

		assertThat(calendar.on(7L, monday).shifts()).containsExactly(new ShiftCalendar.Shift(LocalTime.of(12, 0), LocalTime.of(16, 0), false));
	}

	@Test
	void aHolidayHasNoWeeklyShiftsButAnExtraShiftStillCounts() {
		when(holidays.namesBetween(any(), any())).thenReturn(java.util.Map.of(monday, "Founders Day", nextMonday, "Open house"));

		assertThat(calendar.on(7L, monday).shifts()).isEmpty();
		assertThat(calendar.on(7L, nextMonday).shifts()).containsExactly(new ShiftCalendar.Shift(LocalTime.of(15, 0), LocalTime.of(17, 0), true));
	}

	@Test
	void otherWeekdaysHaveNoShifts() {
		assertThat(calendar.on(7L, monday.plusDays(1)).shifts()).isEmpty();
	}

	@Test
	void timeOffIsCutOutOfShiftsSplittingOneInTwoIfNeeded() {
		List<ShiftCalendar.Shift> shifts = List.of(new ShiftCalendar.Shift(LocalTime.of(9, 0), LocalTime.of(13, 0), false),
				new ShiftCalendar.Shift(LocalTime.of(14, 0), LocalTime.of(16, 0), false));

		List<ShiftCalendar.Shift> left = ShiftCalendar.cutOut(shifts, List.of(
				new ShiftCalendar.Window(LocalTime.of(10, 0), LocalTime.of(11, 0)),
				new ShiftCalendar.Window(LocalTime.of(14, 0), LocalTime.of(16, 0))));

		assertThat(left).containsExactly(new ShiftCalendar.Shift(LocalTime.of(9, 0), LocalTime.of(10, 0), false),
				new ShiftCalendar.Shift(LocalTime.of(11, 0), LocalTime.of(13, 0), false));
	}

	private static Student withId(Student student, Long id) {
		ReflectionTestUtils.setField(student, "id", id);
		return student;
	}

}
