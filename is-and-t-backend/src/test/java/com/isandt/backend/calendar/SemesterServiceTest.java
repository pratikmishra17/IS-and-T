package com.isandt.backend.calendar;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.isandt.backend.common.error.ConflictException;

class SemesterServiceTest {

	private final SemesterRepository semesters = mock(SemesterRepository.class);

	/** A fixed clock: in these tests "today" is always 1 October 2026 in Cleveland. */
	private final Clock october1 = Clock.fixed(LocalDate.of(2026, 10, 1).atStartOfDay(ZoneId.of("America/New_York")).toInstant(),
			ZoneId.of("America/New_York"));

	private final SemesterService service = new SemesterService(semesters, october1);

	private final SemesterDetails fall = new SemesterDetails("Fall 2026", SemesterType.FALL, LocalDate.of(2026, 8, 24),
			LocalDate.of(2026, 12, 12), 20);

	@Test
	void aNewSemesterIsMarkedCurrentWhenTodayFallsInsideIt() {
		when(semesters.save(any(Semester.class))).thenAnswer(call -> call.getArgument(0));

		assertThat(service.create(fall).current()).isTrue();
	}

	@Test
	void semestersCantOverlap() {
		when(semesters.findAll()).thenReturn(List.of(new Semester(fall)));
		SemesterDetails overlapping = new SemesterDetails("Winter 2026", SemesterType.SPRING, LocalDate.of(2026, 12, 1),
				LocalDate.of(2027, 1, 10), 20);

		assertThatThrownBy(() -> service.create(overlapping)).isInstanceOf(ConflictException.class)
			.hasMessageContaining("Fall 2026");
		verify(semesters, never()).save(any());
	}

	@Test
	void theEndCantBeBeforeTheStart() {
		SemesterDetails backwards = new SemesterDetails("Spring 2027", SemesterType.SPRING, LocalDate.of(2027, 5, 1),
				LocalDate.of(2027, 1, 1), 20);

		assertThatThrownBy(() -> service.create(backwards)).isInstanceOf(ConflictException.class);
	}

}
