package com.isandt.backend.task;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import com.isandt.backend.common.error.ConflictException;
import com.isandt.backend.inventory.ReservationService;
import com.isandt.backend.user.Student;
import com.isandt.backend.user.StudentRepository;

class StudentTaskServiceTest {

	private static final ZoneId CLEVELAND = ZoneId.of("America/New_York");

	private final TaskRepository tasks = mock(TaskRepository.class);

	private final StudentRepository students = mock(StudentRepository.class);

	private final ReservationService reservations = mock(ReservationService.class);

	private final TaskAssigner assigner = mock(TaskAssigner.class);

	private final TaskWorkflow workflow = mock(TaskWorkflow.class);

	private final StudentTaskService service = new StudentTaskService(tasks, students, reservations, assigner, workflow,
			mock(TaskEmails.class), Clock.system(CLEVELAND));

	private final Student sam = student(1L, "Sam");

	private final Student rita = student(2L, "Rita");

	private final Task task = task();

	@Test
	void aTaskSomeoneAlreadyHasCantBeClaimed() {
		task.assignTo(rita, false);
		when(students.findById(1L)).thenReturn(Optional.of(sam));
		when(tasks.findById(5L)).thenReturn(Optional.of(task));

		assertThatThrownBy(() -> service.claim(5L, 1L)).isInstanceOf(ConflictException.class);
		assertThat(task.getAssignee()).isEqualTo(rita);
	}

	@Test
	void claimingWhileNotOnShiftIsAllowedButFlaggedForAdmins() {
		when(students.findById(1L)).thenReturn(Optional.of(sam));
		when(tasks.findById(5L)).thenReturn(Optional.of(task));
		when(assigner.isOnShiftForWholeTask(sam, task)).thenReturn(false);

		service.claim(5L, 1L);

		assertThat(task.getAssignee()).isEqualTo(sam);
		assertThat(task.isClaimedOffShift()).isTrue();
	}

	@Test
	void optingOutLooksForSomeoneElseButNeverGivesItBack() {
		task.assignTo(sam, false);
		when(tasks.findById(5L)).thenReturn(Optional.of(task));

		service.optOut(5L, 1L);

		verify(workflow).autoAssign(eq(task), any(), eq(Set.of(1L)));
	}

	@Test
	void couldNotCompleteNeedsAReasonAndReleasesTheItems() {
		task.assignTo(sam, false);
		when(tasks.findById(5L)).thenReturn(Optional.of(task));

		assertThatThrownBy(() -> service.notCompleted(5L, 1L, new OutcomeRequest(" ", null))).isInstanceOf(ConflictException.class);
		verify(reservations, never()).release(any());

		service.notCompleted(5L, 1L, new OutcomeRequest("Employee wasn't there", null));
		assertThat(task.getStatus()).isEqualTo(TaskStatus.NOT_COMPLETED);
		verify(reservations).release(5L);
	}

	@Test
	void onlyTheAssigneeCanFinishATask() {
		task.assignTo(rita, false);
		when(tasks.findById(5L)).thenReturn(Optional.of(task));

		assertThatThrownBy(() -> service.complete(5L, 1L, new OutcomeRequest(null, null))).isInstanceOf(ConflictException.class);
	}

	private static Task task() {
		Task task = new Task(new TaskRequest(TaskType.DEPLOYMENT, "New laptop", null, LocalDate.of(2026, 10, 19), LocalTime.of(10, 0), 30,
				"RT 1408", "Pat Employee", null, null, List.of(), List.of(), null, null), CLEVELAND, null);
		ReflectionTestUtils.setField(task, "id", 5L);
		return task;
	}

	private static Student student(Long id, String name) {
		Student student = new Student(name.toLowerCase() + "@example.com", name, "Student", "S" + id, null);
		ReflectionTestUtils.setField(student, "id", id);
		return student;
	}

}
