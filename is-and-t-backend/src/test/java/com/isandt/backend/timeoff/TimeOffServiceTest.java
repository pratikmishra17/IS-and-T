package com.isandt.backend.timeoff;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import com.isandt.backend.common.error.ConflictException;
import com.isandt.backend.common.web.Saved;
import com.isandt.backend.schedule.AdminScheduleService;
import com.isandt.backend.schedule.ExceptionRequest;
import com.isandt.backend.schedule.ShiftCalendar;
import com.isandt.backend.schedule.ShiftExceptionType;
import com.isandt.backend.task.AdminTaskService;
import com.isandt.backend.task.StudentTaskService;
import com.isandt.backend.task.TaskResponses.Employee;
import com.isandt.backend.task.TaskResponses.Person;
import com.isandt.backend.task.TaskResponses.TaskResponse;
import com.isandt.backend.task.TaskStatus;
import com.isandt.backend.task.TaskType;
import com.isandt.backend.user.AdminRepository;
import com.isandt.backend.user.Student;
import com.isandt.backend.user.StudentRepository;

class TimeOffServiceTest {

	private static final ZoneId CLEVELAND = ZoneId.of("America/New_York");

	private static final LocalDate MONDAY = LocalDate.of(2026, 10, 26);

	private final TimeOffRepository requests = mock(TimeOffRepository.class);

	private final StudentRepository students = mock(StudentRepository.class);

	private final ShiftCalendar shifts = mock(ShiftCalendar.class);

	private final AdminScheduleService schedule = mock(AdminScheduleService.class);

	private final StudentTaskService studentTasks = mock(StudentTaskService.class);

	private final AdminTaskService adminTasks = mock(AdminTaskService.class);

	private final TimeOffService service = new TimeOffService(requests, students, mock(AdminRepository.class), shifts,
			schedule, studentTasks, adminTasks, mock(TimeOffEmails.class),
			Clock.fixed(LocalDate.of(2026, 10, 21).atStartOfDay(CLEVELAND).toInstant(), CLEVELAND));

	private final Student sam = student();

	@Test
	void youCantAskForTimeOffWhenYouArentWorking() {
		when(students.findById(1L)).thenReturn(Optional.of(sam));
		when(shifts.on(1L, MONDAY)).thenReturn(new ShiftCalendar.Day(
				List.of(new ShiftCalendar.Shift(LocalTime.of(9, 0), LocalTime.of(12, 0), false)), false));

		assertThatThrownBy(() -> service.request(1L, new TimeOffBody(MONDAY, LocalTime.of(14, 0), LocalTime.of(15, 0), null)))
			.isInstanceOf(ConflictException.class);
	}

	@Test
	void approvingPartOfADayAddsTimeOffAndReportsWhereEachTaskWent() {
		TimeOffRequest request = new TimeOffRequest(sam, new TimeOffBody(MONDAY, LocalTime.of(9, 0), LocalTime.of(12, 0), "Exam"));
		ReflectionTestUtils.setField(request, "id", 5L);
		when(requests.findById(5L)).thenReturn(Optional.of(request));
		when(shifts.on(1L, MONDAY)).thenReturn(new ShiftCalendar.Day(
				List.of(new ShiftCalendar.Shift(LocalTime.of(9, 0), LocalTime.of(13, 0), false)), false));
		when(studentTasks.tasksBetween(1L, MONDAY, MONDAY)).thenReturn(List.of(
				task(10L, "Laptop setup", "09:30", TaskStatus.ASSIGNED, new Person(1L, "Sam Student")),
				task(11L, "Printer fix", "10:30", TaskStatus.ASSIGNED, new Person(1L, "Sam Student"))));
		when(adminTasks.list(MONDAY, MONDAY, null)).thenReturn(List.of(
				task(10L, "Laptop setup", "09:30", TaskStatus.ASSIGNED, new Person(2L, "Rita Student")),
				task(11L, "Printer fix", "10:30", TaskStatus.UNASSIGNED, null)));

		Saved<TimeOffResponse> saved = service.approve(5L, 9L, new ReviewBody(null));

		ArgumentCaptor<ExceptionRequest> change = ArgumentCaptor.forClass(ExceptionRequest.class);
		verify(schedule).addException(eq(1L), change.capture(), eq(9L));
		assertThat(change.getValue().type()).isEqualTo(ShiftExceptionType.OFF);
		assertThat(saved.result().status()).isEqualTo(TimeOffStatus.APPROVED);
		assertThat(saved.warnings()).anyMatch(w -> w.contains("Laptop setup") && w.contains("went to Rita Student"));
		assertThat(saved.warnings()).anyMatch(w -> w.contains("Printer fix") && w.contains("couldn't be given to anyone"));
	}

	private static TaskResponse task(Long id, String title, String start, TaskStatus status, Person assignee) {
		LocalTime from = LocalTime.parse(start);
		return new TaskResponse(id, TaskType.FIX, title, null, MONDAY, from, from.plusMinutes(30), 30, "RT 1408",
				new Employee("Pat", null, null), List.of(), status, assignee, false, null, null, null, List.of());
	}

	private static Student student() {
		Student student = new Student("sam@example.com", "Sam", "Student", "2001", null);
		ReflectionTestUtils.setField(student, "id", 1L);
		return student;
	}

}
