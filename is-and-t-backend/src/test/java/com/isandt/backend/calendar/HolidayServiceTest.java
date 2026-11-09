package com.isandt.backend.calendar;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.HashSet;
import java.util.Set;

import org.junit.jupiter.api.Test;

class HolidayServiceTest {

	private final HolidayRepository holidays = mock(HolidayRepository.class);

	private final HolidayService service = new HolidayService(holidays, mock(org.springframework.context.ApplicationEventPublisher.class));

	@Test
	void aRangeAddsEveryDayAndSkipsDaysThatAreAlreadyHolidays() {
		when(holidays.findAllDates()).thenReturn(new HashSet<>(Set.of(LocalDate.of(2027, 3, 16))));

		HolidayChanges changes = service.add(new HolidayRequest("Spring Break", LocalDate.of(2027, 3, 15), LocalDate.of(2027, 3, 19)));

		assertThat(changes).isEqualTo(new HolidayChanges(4, 1));
		verify(holidays, times(4)).save(any(Holiday.class));
	}

	@Test
	void withoutALastDayItIsASingleDay() {
		when(holidays.findAllDates()).thenReturn(new HashSet<>());

		assertThat(service.add(new HolidayRequest("Labor Day", LocalDate.of(2026, 9, 7), null)))
			.isEqualTo(new HolidayChanges(1, 0));
	}

}
