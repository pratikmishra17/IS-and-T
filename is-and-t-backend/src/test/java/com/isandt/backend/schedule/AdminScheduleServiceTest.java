package com.isandt.backend.schedule;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;

import com.isandt.backend.calendar.HolidayService;
import com.isandt.backend.calendar.SemesterService;
import com.isandt.backend.common.error.ConflictException;
import com.isandt.backend.user.AdminRepository;
import com.isandt.backend.user.Student;
import com.isandt.backend.user.StudentRepository;

class AdminScheduleServiceTest {

	private static final LocalDate SATURDAY = LocalDate.of(2026, 11, 14);

	private static final LocalDate MONDAY = LocalDate.of(2026, 11, 16);

	private final StudentRepository students = mock(StudentRepository.class);

	private final ShiftExceptionRepository exceptions = mock(ShiftExceptionRepository.class);

	private final ShiftCalendar calendar = mock(ShiftCalendar.class);

	private final SemesterService semesters = mock(SemesterService.class);

	private final AdminScheduleService service = new AdminScheduleService(students, mock(AdminRepository.class), semesters,
			mock(HolidayService.class), mock(ShiftPatternRepository.class), exceptions, mock(ScheduleRequestRepository.class),
			mock(StudentSchedules.class), calendar, mock(ScheduleEmails.class), Clock.systemDefaultZone(),
			mock(ApplicationEventPublisher.class), mock(KeptDays.class), mock(AvailabilityBlockRepository.class),
			mock(ShiftChangeRepository.class));

	AdminScheduleServiceTest() {
		Student sam = new Student("sam@example.com", "Sam", "Lee", "S1", null);
		ReflectionTestUtils.setField(sam, "id", 1L);
		when(students.findById(1L)).thenReturn(Optional.of(sam));
		when(calendar.on(any(), any())).thenReturn(new ShiftCalendar.Day(List.of(), false));
		when(semesters.containing(any())).thenReturn(Optional.empty());
		when(exceptions.save(any())).thenAnswer(call -> call.getArgument(0));
	}

	@Test
	void aWholeDayOffWithTimesIsRefusedRatherThanQuietlyTakingTheWholeDay() {
		assertThatThrownBy(() -> service.addException(1L,
				new ExceptionRequest(MONDAY, ShiftExceptionType.CANCEL, LocalTime.of(16, 0), LocalTime.of(18, 0), null), 9L))
				.isInstanceOf(ConflictException.class).hasMessageContaining("Time off (hours)");
	}

	@Test
	void anExtraWeekendShiftIsAllowedButThereIsNoWeeklyShiftToCallOff() {
		var saved = service.addException(1L,
				new ExceptionRequest(SATURDAY, ShiftExceptionType.EXTRA, LocalTime.of(10, 0), LocalTime.of(14, 0), "Open house"), 9L);
		assertThat(saved.result().type()).isEqualTo(ShiftExceptionType.EXTRA);

		assertThatThrownBy(() -> service.addException(1L, new ExceptionRequest(SATURDAY, ShiftExceptionType.CANCEL, null, null, null), 9L))
				.isInstanceOf(ConflictException.class).hasMessageContaining("Weekends");
	}

}
