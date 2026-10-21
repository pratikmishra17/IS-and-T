package com.isandt.backend.calendar;

import java.time.LocalDate;

public record HolidayResponse(Long id, LocalDate date, String name, HolidaySource source) {

	static HolidayResponse from(Holiday holiday) {
		return new HolidayResponse(holiday.getId(), holiday.getDate(), holiday.getName(), holiday.getSource());
	}

}
