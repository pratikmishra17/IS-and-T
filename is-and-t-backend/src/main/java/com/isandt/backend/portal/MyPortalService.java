package com.isandt.backend.portal;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.isandt.backend.calendar.HolidayService;
import com.isandt.backend.calendar.Semester;
import com.isandt.backend.calendar.SemesterService;
import com.isandt.backend.inventory.ItemService;
import com.isandt.backend.portal.PortalResponses.MyDay;
import com.isandt.backend.portal.PortalResponses.MyWeek;
import com.isandt.backend.portal.PortalResponses.MyWeekDay;
import com.isandt.backend.portal.PortalResponses.ShiftView;
import com.isandt.backend.portal.PortalResponses.StockLookup;
import com.isandt.backend.portal.PortalResponses.WeekHours;
import com.isandt.backend.schedule.ShiftCalendar;
import com.isandt.backend.schedule.StudentScheduleService;
import com.isandt.backend.task.StudentTaskService;
import com.isandt.backend.task.TaskResponses.TaskResponse;

/**
 * The student's Home and My week pages. This package only combines what the schedule, task and
 * calendar packages already know, so none of those has to depend on the others for it.
 */
@Service
public class MyPortalService {

	private final ShiftCalendar shifts;

	private final SemesterService semesters;

	private final HolidayService holidays;

	private final StudentTaskService tasks;

	private final StudentScheduleService schedules;

	private final ItemService items;

	private final Clock clock;

	MyPortalService(ShiftCalendar shifts, SemesterService semesters, HolidayService holidays, StudentTaskService tasks,
			StudentScheduleService schedules, ItemService items, Clock clock) {
		this.shifts = shifts;
		this.semesters = semesters;
		this.holidays = holidays;
		this.tasks = tasks;
		this.schedules = schedules;
		this.items = items;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public MyDay today(Long studentId) {
		LocalDate today = LocalDate.now(clock);
		MyWeek week = week(studentId, today);
		MyWeekDay day = week.days().stream().filter(d -> d.date().equals(today)).findFirst()
				.orElseGet(() -> weekendDay(studentId, today));
		Optional<Semester> semester = semesters.containing(today);
		long upForGrabs = tasks.myTasks(studentId).available().stream().filter(task -> task.date().equals(today)).count();
		return new MyDay(today, day.holiday(), day.dayOff(), day.shifts(), day.tasks(), (int) upForGrabs, week.hours(),
				week.weeklyHourLimit(), week.semesterName(),
				semester.map(s -> schedules.get(studentId, s.getId()).request()).orElse(null));
	}

	/** Monday to Friday of the week containing the given day (this week if null). */
	@Transactional(readOnly = true)
	public MyWeek week(Long studentId, LocalDate anyDay) {
		LocalDate monday = (anyDay == null ? LocalDate.now(clock) : anyDay).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
		LocalDate friday = monday.plusDays(4);
		Map<LocalDate, ShiftCalendar.Day> days = shifts.between(List.of(studentId), monday, friday).get(studentId);
		Map<LocalDate, String> holidayNames = holidays.namesBetween(monday, friday);
		List<TaskResponse> weekTasks = tasks.tasksBetween(studentId, monday, friday);
		Optional<Semester> semester = monday.datesUntil(friday.plusDays(1)).map(semesters::containing)
				.flatMap(Optional::stream).findFirst();

		List<MyWeekDay> weekDays = new ArrayList<>();
		for (LocalDate date = monday; !date.isAfter(friday); date = date.plusDays(1)) {
			LocalDate day = date;
			ShiftCalendar.Day shiftDay = days.get(day);
			weekDays.add(new MyWeekDay(day, holidayNames.get(day), shiftDay.cancelled(), views(shiftDay),
					shiftDay.timeOff().stream().map(w -> new ShiftView(w.start(), w.end(), false)).toList(),
					weekTasks.stream().filter(task -> task.date().equals(day)).toList()));
		}
		return new MyWeek(monday, weekDays, hours(days.values()), semester.map(Semester::getWeeklyHourLimit).orElse(null),
				semester.map(Semester::getName).orElse(null));
	}

	/** Scheduled hours for every week of the semester, for the "hours by week" table. */
	@Transactional(readOnly = true)
	public List<WeekHours> semesterHours(Long studentId, Long semesterId) {
		Semester semester = semesters.find(semesterId);
		Map<LocalDate, ShiftCalendar.Day> days = shifts.between(List.of(studentId), semester.getStartDate(),
				semester.getEndDate()).get(studentId);
		List<WeekHours> weeks = new ArrayList<>();
		LocalDate monday = semester.getStartDate().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
		for (; !monday.isAfter(semester.getEndDate()); monday = monday.plusWeeks(1)) {
			LocalDate start = monday;
			weeks.add(new WeekHours(start, hours(days.entrySet().stream()
					.filter(e -> !e.getKey().isBefore(start) && e.getKey().isBefore(start.plusWeeks(1)))
					.map(Map.Entry::getValue).toList())));
		}
		return weeks;
	}

	/** Everything in stock (archived items left out), for the student's read-only lookup. */
	@Transactional(readOnly = true)
	public List<StockLookup> stock() {
		return items.list().stream().filter(item -> !item.archived())
				.map(item -> new StockLookup(item.id(), item.name(), item.categoryName(), item.manufacturer(), item.model(),
						item.attributes(), item.available(),
						item.stock().stream().map(s -> new StockLookup.Room(s.label(), s.quantity())).toList()))
				.toList();
	}

	private MyWeekDay weekendDay(Long studentId, LocalDate date) {
		return new MyWeekDay(date, holidays.namesBetween(date, date).get(date), false, List.of(), List.of(),
				tasks.tasksBetween(studentId, date, date));
	}

	private static List<ShiftView> views(ShiftCalendar.Day day) {
		return day.shifts().stream().map(s -> new ShiftView(s.start(), s.end(), s.extra())).toList();
	}

	private static double hours(Collection<ShiftCalendar.Day> days) {
		return days.stream().flatMap(day -> day.shifts().stream())
				.mapToLong(shift -> Duration.between(shift.start(), shift.end()).toMinutes()).sum() / 60.0;
	}

}
