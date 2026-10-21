package com.isandt.backend.portal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.isandt.backend.calendar.HolidayService;
import com.isandt.backend.calendar.SemesterService;
import com.isandt.backend.schedule.ShiftCalendar;
import com.isandt.backend.schedule.StudentScheduleService;
import com.isandt.backend.task.StudentTaskService;

class MyPortalServiceTest {

	private static final ZoneId CLEVELAND = ZoneId.of("America/New_York");

	private static final LocalDate MONDAY = LocalDate.of(2026, 10, 19);

	private final ShiftCalendar shifts = mock(ShiftCalendar.class);

	private final HolidayService holidays = mock(HolidayService.class);

	private final SemesterService semesters = mock(SemesterService.class);

	private final StudentTaskService tasks = mock(StudentTaskService.class);

	private final MyPortalService service = new MyPortalService(shifts, semesters, holidays, tasks,
			mock(StudentScheduleService.class), mock(com.isandt.backend.inventory.ItemService.class), Clock.fixed(MONDAY.plusDays(2).atStartOfDay(CLEVELAND).toInstant(), CLEVELAND));

	@Test
	void theWeekAddsUpShiftsSkipsDaysOffAndMarksHolidays() {
		Map<LocalDate, ShiftCalendar.Day> days = new HashMap<>();
		for (int i = 0; i < 5; i++) {
			days.put(MONDAY.plusDays(i), new ShiftCalendar.Day(List.of(), false));
		}
		days.put(MONDAY, new ShiftCalendar.Day(List.of(new ShiftCalendar.Shift(LocalTime.of(9, 0), LocalTime.of(13, 0), false)), false));
		days.put(MONDAY.plusDays(1), new ShiftCalendar.Day(List.of(), true));
		days.put(MONDAY.plusDays(3), new ShiftCalendar.Day(List.of(new ShiftCalendar.Shift(LocalTime.of(14, 0), LocalTime.of(15, 30), true)), false));
		when(shifts.between(anyList(), any(), any())).thenReturn(Map.of(7L, days));
		when(holidays.namesBetween(any(), any())).thenReturn(Map.of(MONDAY.plusDays(4), "Fall Break"));
		when(tasks.tasksBetween(any(), any(), any())).thenReturn(List.of());
		when(semesters.containing(any())).thenReturn(Optional.empty());

		PortalResponses.MyWeek week = service.week(7L, MONDAY.plusDays(2));

		assertThat(week.start()).isEqualTo(MONDAY);
		assertThat(week.hours()).isEqualTo(5.5);
		assertThat(week.days().get(1).dayOff()).isTrue();
		assertThat(week.days().get(3).shifts().getFirst().extra()).isTrue();
		assertThat(week.days().get(4).holiday()).isEqualTo("Fall Break");
		assertThat(week.weeklyHourLimit()).isNull();
	}

}
