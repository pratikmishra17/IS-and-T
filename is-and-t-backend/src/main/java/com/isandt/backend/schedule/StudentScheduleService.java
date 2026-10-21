package com.isandt.backend.schedule;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.isandt.backend.calendar.Semester;
import com.isandt.backend.calendar.SemesterResponse;
import com.isandt.backend.calendar.SemesterService;
import com.isandt.backend.common.error.ConflictException;
import com.isandt.backend.common.error.NotFoundException;
import com.isandt.backend.schedule.ScheduleResponses.StudentSchedule;
import com.isandt.backend.user.Admin;
import com.isandt.backend.user.AdminRepository;
import com.isandt.backend.user.Student;
import com.isandt.backend.user.StudentRepository;

/** The student side: entering class times and preferred hours, and submitting them for approval. */
@Service
public class StudentScheduleService {

	private final StudentRepository students;

	private final AdminRepository admins;

	private final SemesterService semesters;

	private final AvailabilityBlockRepository availability;

	private final ScheduleRequestRepository requests;

	private final StudentSchedules schedules;

	private final ScheduleEmails emails;

	private final Clock clock;

	StudentScheduleService(StudentRepository students, AdminRepository admins, SemesterService semesters,
			AvailabilityBlockRepository availability, ScheduleRequestRepository requests, StudentSchedules schedules,
			ScheduleEmails emails, Clock clock) {
		this.students = students;
		this.admins = admins;
		this.semesters = semesters;
		this.availability = availability;
		this.requests = requests;
		this.schedules = schedules;
		this.emails = emails;
		this.clock = clock;
	}

	public List<SemesterResponse> semesters() {
		return semesters.currentAndUpcoming();
	}

	@Transactional(readOnly = true)
	public StudentSchedule get(Long studentId, Long semesterId) {
		return schedules.describe(student(studentId), semesters.find(semesterId));
	}

	/** Replaces the student's class times and preferred hours for the semester. */
	@Transactional
	public StudentSchedule saveAvailability(Long studentId, Long semesterId, AvailabilityRequest request) {
		Student student = student(studentId);
		Semester semester = plannable(semesterId);
		ShiftRules.check(request.classes(), false, "Class");
		ShiftRules.check(request.preferred(), true, "Preferred hours");

		availability.deleteByStudentAndSemester(student, semester);
		availability.flush(); // run the DELETE before the INSERTs below
		request.classes().forEach(block -> availability.save(new AvailabilityBlock(student, semester, AvailabilityKind.CLASS, block)));
		request.preferred().forEach(block -> availability.save(new AvailabilityBlock(student, semester, AvailabilityKind.PREFERRED, block)));
		return schedules.describe(student, semester);
	}

	/** Asks the admins to approve the preferred hours; submitting again while waiting just updates the time. */
	@Transactional
	public StudentSchedule submit(Long studentId, Long semesterId) {
		Student student = student(studentId);
		Semester semester = plannable(semesterId);
		if (schedules.describe(student, semester).preferred().isEmpty()) {
			throw new ConflictException("Add the hours you'd like to work before submitting.");
		}

		requests.findFirstByStudentAndSemesterOrderBySubmittedAtDesc(student, semester)
				.filter(request -> request.getStatus() == ScheduleRequestStatus.SUBMITTED)
				.ifPresentOrElse(ScheduleRequest::resubmit, () -> requests.save(new ScheduleRequest(student, semester)));
		emails.submitted(student, semester, admins.findAllByOrderByLastNameAscFirstNameAsc().stream()
				.filter(Admin::isActive).toList());
		return schedules.describe(student, semester);
	}

	private Semester plannable(Long semesterId) {
		Semester semester = semesters.find(semesterId);
		if (semester.getEndDate().isBefore(LocalDate.now(clock))) {
			throw new ConflictException(semester.getName() + " is over, so its hours can't be changed.");
		}
		return semester;
	}

	private Student student(Long id) {
		return students.findById(id).orElseThrow(() -> new NotFoundException("Student not found."));
	}

}
