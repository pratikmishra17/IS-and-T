package com.isandt.backend.calendar;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.isandt.backend.common.error.ConflictException;
import com.isandt.backend.common.error.NotFoundException;

/**
 * Holidays, managed in the admin portal: added by hand (one day or a range) or imported from an
 * .ics file. Days that are already holidays are skipped, never duplicated.
 */
@Service
public class HolidayService {

	private final HolidayRepository holidays;

	HolidayService(HolidayRepository holidays) {
		this.holidays = holidays;
	}

	@Transactional(readOnly = true)
	public List<HolidayResponse> list() {
		return holidays.findAllByOrderByDateAsc().stream().map(HolidayResponse::from).toList();
	}

	@Transactional
	public HolidayChanges add(HolidayRequest request) {
		LocalDate to = request.to() == null ? request.from() : request.to();
		if (to.isBefore(request.from())) {
			throw new ConflictException("The last day can't be before the first day.");
		}
		if (request.from().plusDays(IcsHolidayParser.MAX_EVENT_DAYS).isBefore(to)) {
			throw new ConflictException("A holiday can be at most " + IcsHolidayParser.MAX_EVENT_DAYS + " days long.");
		}
		return save(request.from().datesUntil(to.plusDays(1))
				.map(day -> new IcsHolidayParser.ParsedHoliday(day, request.name()))
				.toList(), HolidaySource.MANUAL);
	}

	@Transactional
	public HolidayChanges importIcs(String icsContent) {
		List<IcsHolidayParser.ParsedHoliday> parsed = IcsHolidayParser.parse(icsContent);
		if (parsed.isEmpty()) {
			throw new ConflictException("No all-day events were found in this file. Is it an .ics calendar file?");
		}
		return save(parsed, HolidaySource.ICS_IMPORT);
	}

	/** Holidays from..to (inclusive) by date, for marking them in schedules. */
	@Transactional(readOnly = true)
	public Map<LocalDate, String> namesBetween(LocalDate from, LocalDate to) {
		return holidays.findAllByOrderByDateAsc().stream()
				.filter(holiday -> !holiday.getDate().isBefore(from) && !holiday.getDate().isAfter(to))
				.collect(Collectors.toMap(Holiday::getDate, Holiday::getName, (first, second) -> first, TreeMap::new));
	}

	@Transactional
	public void delete(Long id) {
		holidays.delete(holidays.findById(id).orElseThrow(() -> new NotFoundException("Holiday " + id + " not found.")));
	}

	/** Saves each day that isn't a holiday yet; the set also catches the same day twice in one file. */
	private HolidayChanges save(List<IcsHolidayParser.ParsedHoliday> days, HolidaySource source) {
		Set<LocalDate> taken = holidays.findAllDates();
		int added = 0;
		for (IcsHolidayParser.ParsedHoliday day : days) {
			if (taken.add(day.date())) {
				holidays.save(new Holiday(day.date(), day.name(), source));
				added++;
			}
		}
		return new HolidayChanges(added, days.size() - added);
	}

}
