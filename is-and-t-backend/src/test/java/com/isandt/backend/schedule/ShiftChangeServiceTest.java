package com.isandt.backend.schedule;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;

import com.isandt.backend.calendar.Semester;
import com.isandt.backend.calendar.SemesterService;
import com.isandt.backend.common.error.ConflictException;
import com.isandt.backend.schedule.ShiftChangeDtos.ChangeRequest;
import com.isandt.backend.schedule.ShiftChangeDtos.Hours;
import com.isandt.backend.schedule.ShiftChangeRequest.Block;
import com.isandt.backend.schedule.ShiftChangeRequest.Scope;
import com.isandt.backend.user.AdminRepository;
import com.isandt.backend.user.Student;
import com.isandt.backend.user.StudentRepository;

class ShiftChangeServiceTest {

	/** Wednesday, Oct 28 2026. */
	private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-28T14:00:00Z"), ZoneId.of("America/New_York"));

	private static final LocalDate THURSDAY = LocalDate.of(2026, 10, 29);

	private final ShiftChangeRepository changes = mock(ShiftChangeRepository.class);

	private final ShiftPatternRepository patterns = mock(ShiftPatternRepository.class);

	private final ShiftExceptionRepository exceptions = mock(ShiftExceptionRepository.class);

	private final StudentRepository students = mock(StudentRepository.class);

	private final SemesterService semesters = mock(SemesterService.class);

	private final ShiftCalendar calendar = mock(ShiftCalendar.class);

	private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);

	private final KeptDays keptDays = mock(KeptDays.class);

	private final ShiftChangeService service = new ShiftChangeService(changes, patterns, exceptions, students,
			mock(AdminRepository.class), semesters, calendar, events, CLOCK, keptDays);

	private final Student sam = new Student("sam@example.com", "Sam", "Lee", "S1", null);

	private final Semester fall = mock(Semester.class);

	ShiftChangeServiceTest() {
		ReflectionTestUtils.setField(sam, "id", 1L);
		when(students.findById(1L)).thenReturn(Optional.of(sam));
		when(semesters.containing(any())).thenReturn(Optional.of(fall));
		when(calendar.on(any(), any())).thenReturn(new ShiftCalendar.Day(List.of(), false));
		when(changes.save(any())).thenAnswer(call -> call.getArgument(0));
	}

	@Test
	void everyWeekReplacesOnlyThatWeekdaysShifts() {
		ShiftPattern monday = new ShiftPattern(sam, fall, new TimeBlock(DayOfWeek.MONDAY, LocalTime.of(9, 0), LocalTime.of(12, 0)));
		ShiftPattern thursday = new ShiftPattern(sam, fall, new TimeBlock(DayOfWeek.THURSDAY, LocalTime.of(9, 0), LocalTime.of(17, 0)));
		when(patterns.findByStudentAndSemesterOrderByDayAscStartAsc(sam, fall)).thenReturn(List.of(monday, thursday));
		stored(new ShiftChangeRequest(sam, fall, Scope.EVERY_WEEK, THURSDAY, List.of(block(13, 17)), null, Instant.now()));

		service.approve(9L, 7L, null);

		verify(keptDays).beforeWeekdayChange(sam, fall, DayOfWeek.THURSDAY, THURSDAY); // earlier Thursdays keep 9-5
		verify(patterns).deleteAll(List.of(thursday)); // Monday stays
		ArgumentCaptor<ShiftPattern> saved = ArgumentCaptor.forClass(ShiftPattern.class);
		verify(patterns).save(saved.capture());
		assertThat(saved.getValue().toBlock()).isEqualTo(new TimeBlock(DayOfWeek.THURSDAY, LocalTime.of(13, 0), LocalTime.of(17, 0)));
		verify(events).publishEvent(new ShiftsChanged(1L));
	}

	@Test
	void oneDayCallsOffTheWeeklyShiftThatDayAndAddsTheNewHours() {
		when(calendar.on(1L, THURSDAY)).thenReturn(new ShiftCalendar.Day(
				List.of(new ShiftCalendar.Shift(LocalTime.of(9, 0), LocalTime.of(17, 0), false)), false));
		stored(new ShiftChangeRequest(sam, fall, Scope.ONE_DAY, THURSDAY, List.of(block(13, 15)), "Exam in the morning", Instant.now()));

		service.approve(9L, 7L, null);

		ArgumentCaptor<ShiftException> saved = ArgumentCaptor.forClass(ShiftException.class);
		verify(exceptions, times(2)).save(saved.capture());
		assertThat(saved.getAllValues()).extracting(ShiftException::getType)
				.containsExactly(ShiftExceptionType.CANCEL, ShiftExceptionType.EXTRA);
		assertThat(saved.getAllValues().get(1).getStart()).isEqualTo(LocalTime.of(13, 0));
		assertThat(saved.getAllValues().get(1).getReason()).isEqualTo("Asked for by Sam: Exam in the morning");
		verify(patterns, never()).save(any()); // the weekly shifts are untouched
	}

	@Test
	void askingForADayOffIsJustTheCancel() {
		when(calendar.on(1L, THURSDAY)).thenReturn(new ShiftCalendar.Day(
				List.of(new ShiftCalendar.Shift(LocalTime.of(9, 0), LocalTime.of(17, 0), false)), false));
		stored(new ShiftChangeRequest(sam, fall, Scope.ONE_DAY, THURSDAY, List.of(), null, Instant.now()));

		service.approve(9L, 7L, null);

		ArgumentCaptor<ShiftException> saved = ArgumentCaptor.forClass(ShiftException.class);
		verify(exceptions).save(saved.capture());
		assertThat(saved.getValue().getType()).isEqualTo(ShiftExceptionType.CANCEL);
	}

	@Test
	void requestsMustBeComingWithSensibleHoursAndWeeklyOnlyOnWeekdays() {
		List<Hours> afternoon = List.of(new Hours(LocalTime.of(13, 0), LocalTime.of(15, 0)));
		assertThatThrownBy(() -> service.request(1L, new ChangeRequest(Scope.ONE_DAY, LocalDate.of(2026, 10, 27), afternoon, null)))
				.isInstanceOf(ConflictException.class).hasMessageContaining("passed");
		LocalDate saturday = LocalDate.of(2026, 10, 31);
		assertThatThrownBy(() -> service.request(1L, new ChangeRequest(Scope.EVERY_WEEK, saturday, afternoon, null)))
				.isInstanceOf(ConflictException.class).hasMessageContaining("Monday to Friday");
		assertThat(service.request(1L, new ChangeRequest(Scope.ONE_DAY, saturday, afternoon, null)).status())
				.isEqualTo(ShiftChangeRequest.Status.PENDING); // one weekend day is fine
		List<Hours> overlapping = List.of(new Hours(LocalTime.of(9, 0), LocalTime.of(12, 0)), new Hours(LocalTime.of(11, 0), LocalTime.of(13, 0)));
		assertThatThrownBy(() -> service.request(1L, new ChangeRequest(Scope.EVERY_WEEK, THURSDAY, overlapping, null)))
				.isInstanceOf(ConflictException.class).hasMessageContaining("overlap");

		assertThat(service.request(1L, new ChangeRequest(Scope.EVERY_WEEK, THURSDAY, afternoon, " ")).status())
				.isEqualTo(ShiftChangeRequest.Status.PENDING);
	}

	@Test
	void anAnsweredRequestCantBeAnsweredAgain() {
		stored(new ShiftChangeRequest(sam, fall, Scope.ONE_DAY, THURSDAY, List.of(), null, Instant.now()));
		service.decline(9L, 7L, "We need you that day");

		assertThatThrownBy(() -> service.approve(9L, 7L, null)).isInstanceOf(ConflictException.class);
	}

	private void stored(ShiftChangeRequest change) {
		ReflectionTestUtils.setField(change, "id", 9L);
		when(changes.findById(9L)).thenReturn(Optional.of(change));
	}

	private static Block block(int from, int to) {
		return new Block(LocalTime.of(from, 0), LocalTime.of(to, 0));
	}

}
