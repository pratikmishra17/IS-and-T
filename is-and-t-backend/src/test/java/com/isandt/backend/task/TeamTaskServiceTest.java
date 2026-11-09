package com.isandt.backend.task;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import com.isandt.backend.common.error.ForbiddenException;
import com.isandt.backend.common.web.Saved;
import com.isandt.backend.inventory.ReservationService;
import com.isandt.backend.task.TaskResponses.TaskResponse;
import com.isandt.backend.user.AdminRepository;
import com.isandt.backend.user.Student;
import com.isandt.backend.user.StudentRepository;
import com.isandt.backend.user.TaskAccess;

class TeamTaskServiceTest {

	private static final ZoneId CLEVELAND = ZoneId.of("America/New_York");

	private final TaskRepository tasks = mock(TaskRepository.class);

	private final TaskOfferRepository offers = mock(TaskOfferRepository.class);

	private final StudentRepository students = mock(StudentRepository.class);

	private final AdminTaskService adminTasks = mock(AdminTaskService.class);

	private final StudentTaskService studentTasks = mock(StudentTaskService.class);

	private final ReservationService reservations = mock(ReservationService.class);

	private final TaskWorkflow workflow = mock(TaskWorkflow.class);

	private final TeamTaskService service = new TeamTaskService(tasks, offers, students, mock(AdminRepository.class), adminTasks,
			studentTasks, reservations, workflow, Clock.system(CLEVELAND));

	private final Student sam = student(1L, "Sam");

	private final Student rita = student(2L, "Rita");

	private final Task task = task();

	TeamTaskServiceTest() {
		when(students.findById(1L)).thenReturn(Optional.of(sam));
		when(students.findById(2L)).thenReturn(Optional.of(rita));
		when(tasks.findById(5L)).thenReturn(Optional.of(task));
	}

	@Test
	void aStudentWhoCanOnlyLookCantPlanTasks() {
		assertThatThrownBy(() -> service.create(request(), 1L)).isInstanceOf(ForbiddenException.class);
		assertThatThrownBy(() -> service.assign(5L, new AssignRequest(2L), 1L)).isInstanceOf(ForbiddenException.class);
		verify(adminTasks, never()).create(any(), any(String.class), any());
	}

	@Test
	void aStudentWithEditAccessPlansTasksUnderTheirOwnName() {
		sam.changeTaskAccess(TaskAccess.EDIT);
		TaskResponse created = mock(TaskResponse.class);
		when(created.title()).thenReturn("New laptop");
		when(adminTasks.create(any(), eq("Sam Student"), isNull())).thenReturn(new Saved<>(created, List.of()));

		service.create(request(), 1L);

		verify(adminTasks).create(any(), eq("Sam Student"), isNull()); // no admin made it
	}

	@Test
	void completeAccessMarksSomeoneElsesTaskDoneButItStaysTheirs() {
		sam.changeTaskAccess(TaskAccess.COMPLETE);
		task.assignTo(rita, false);

		service.complete(5L, 1L, new OutcomeRequest("All set", null));

		assertThat(task.getStatus()).isEqualTo(TaskStatus.COMPLETED);
		assertThat(task.getAssignee()).isEqualTo(rita);
		verify(reservations).fulfil(eq(5L), any(), eq(Map.of()), eq(rita)); // the stock used is counted against Rita
		verify(workflow).record(task, TaskEventType.COMPLETED, "Sam Student", "For Rita Student");
	}

	@Test
	void lookingOnlyIsNotEnoughToMarkSomeoneElsesTaskDone() {
		task.assignTo(rita, false);

		assertThatThrownBy(() -> service.complete(5L, 1L, new OutcomeRequest(null, null))).isInstanceOf(ForbiddenException.class);
		assertThat(task.getStatus()).isEqualTo(TaskStatus.ASSIGNED);
	}

	@Test
	void yourOwnTaskIsFinishedTheUsualWayWhateverYourAccess() {
		task.assignTo(sam, false);
		OutcomeRequest done = new OutcomeRequest(null, null);

		service.complete(5L, 1L, done);

		verify(studentTasks).complete(5L, 1L, done);
	}

	@Test
	void iCanDoThisTakesATaskNobodyHasStraightAway() {
		when(studentTasks.claim(5L, 1L)).thenReturn(mock(TaskResponse.class));

		TeamTaskService.OfferResult result = service.offer(5L, 1L, null);

		assertThat(result.claimed()).isTrue();
		verify(offers, never()).save(any());
	}

	@Test
	void iCanDoThisOnSomeoneElsesTaskAsksTheAdmins() {
		task.assignTo(rita, false);
		when(offers.save(any())).thenAnswer(call -> call.getArgument(0));

		TeamTaskService.OfferResult result = service.offer(5L, 1L, "I'm free then");

		assertThat(result.claimed()).isFalse();
		assertThat(result.offer().studentName()).isEqualTo("Sam Student");
		assertThat(result.offer().note()).isEqualTo("I'm free then");
		assertThat(result.offer().currentAssignee()).isEqualTo("Rita Student");
		assertThat(task.getAssignee()).isEqualTo(rita); // nothing changes until an admin says so
	}

	@Test
	void acceptingAnOfferGivesThemTheTaskAndAnswersTheOtherOffers() {
		task.assignTo(rita, false);
		Student ana = student(3L, "Ana");
		TaskOffer samsOffer = offer(10L, sam);
		TaskOffer anasOffer = offer(11L, ana);
		when(offers.findById(10L)).thenReturn(Optional.of(samsOffer));
		when(offers.findByTaskAndStatus(task, TaskOffer.Status.PENDING)).thenReturn(List.of(anasOffer));

		service.accept(10L, 7L);

		verify(adminTasks).assign(5L, new AssignRequest(1L), 7L);
		assertThat(samsOffer.getStatus()).isEqualTo(TaskOffer.Status.ACCEPTED);
		assertThat(anasOffer.getStatus()).isEqualTo(TaskOffer.Status.DECLINED);
	}

	@Test
	void offersForAFinishedTaskOrOneAlreadyTheirsStopWaiting() {
		task.assignTo(rita, false);
		TaskOffer samsOffer = offer(10L, sam);
		Task other = task();
		other.assignTo(rita, false);
		TaskOffer stillUseful = new TaskOffer(other, sam, null, java.time.Instant.now());
		when(offers.findByStatusOrderByCreatedAtAsc(TaskOffer.Status.PENDING)).thenReturn(List.of(samsOffer, stillUseful));
		task.complete("Done");

		service.pendingOffers();

		assertThat(samsOffer.getStatus()).isEqualTo(TaskOffer.Status.CLOSED); // nobody needs to answer it now
		assertThat(stillUseful.getStatus()).isEqualTo(TaskOffer.Status.PENDING);

		other.assignTo(sam, false); // an admin gave Sam that task directly
		service.pendingOffers();
		assertThat(stillUseful.getStatus()).isEqualTo(TaskOffer.Status.CLOSED);
	}

	private TaskOffer offer(Long id, Student student) {
		TaskOffer offer = new TaskOffer(task, student, null, java.time.Instant.now());
		ReflectionTestUtils.setField(offer, "id", id);
		return offer;
	}

	private static TaskRequest request() {
		return new TaskRequest(TaskType.DEPLOYMENT, "New laptop", null, LocalDate.of(2026, 10, 19), LocalTime.of(10, 0), 30,
				"RT 1408", "Pat Employee", null, null, List.of(), List.of(), null, null);
	}

	private static Task task() {
		Task task = new Task(request(), CLEVELAND, null);
		ReflectionTestUtils.setField(task, "id", 5L);
		return task;
	}

	private static Student student(Long id, String name) {
		Student student = new Student(name.toLowerCase() + "@example.com", name, "Student", "S" + id, null);
		ReflectionTestUtils.setField(student, "id", id);
		return student;
	}

}
