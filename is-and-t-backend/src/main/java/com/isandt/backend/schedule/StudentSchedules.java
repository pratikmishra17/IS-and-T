package com.isandt.backend.schedule;

import java.util.List;

import org.springframework.stereotype.Component;

import com.isandt.backend.calendar.Semester;
import com.isandt.backend.calendar.SemesterService;
import com.isandt.backend.schedule.ScheduleResponses.ExceptionInfo;
import com.isandt.backend.schedule.ScheduleResponses.RequestInfo;
import com.isandt.backend.schedule.ScheduleResponses.StudentSchedule;
import com.isandt.backend.user.Student;

/** Builds one student's schedule for a semester; shared by the student and admin services. */
@Component
class StudentSchedules {

	private final SemesterService semesters;

	private final AvailabilityBlockRepository availability;

	private final ShiftPatternRepository patterns;

	private final ShiftExceptionRepository exceptions;

	private final ScheduleRequestRepository requests;

	StudentSchedules(SemesterService semesters, AvailabilityBlockRepository availability, ShiftPatternRepository patterns,
			ShiftExceptionRepository exceptions, ScheduleRequestRepository requests) {
		this.semesters = semesters;
		this.availability = availability;
		this.patterns = patterns;
		this.exceptions = exceptions;
		this.requests = requests;
	}

	StudentSchedule describe(Student student, Semester semester) {
		List<AvailabilityBlock> blocks = availability.findByStudentAndSemesterOrderByDayAscStartAsc(student, semester);
		List<TimeBlock> shifts = patterns.findByStudentAndSemesterOrderByDayAscStartAsc(student, semester).stream()
				.map(ShiftPattern::toBlock).toList();
		return new StudentSchedule(student.getId(), student.getFirstName() + " " + student.getLastName(),
				semesters.describe(semester), blocksOf(blocks, AvailabilityKind.CLASS),
				blocksOf(blocks, AvailabilityKind.PREFERRED), shifts, ShiftRules.hours(shifts),
				RequestInfo.from(requests.findFirstByStudentAndSemesterOrderBySubmittedAtDesc(student, semester).orElse(null)),
				exceptions.findByStudentAndDateBetweenOrderByDateAsc(student, semester.getStartDate(), semester.getEndDate())
					.stream().map(ExceptionInfo::from).toList());
	}

	List<TimeBlock> classes(Student student, Semester semester) {
		return blocksOf(availability.findByStudentAndSemesterOrderByDayAscStartAsc(student, semester), AvailabilityKind.CLASS);
	}

	private static List<TimeBlock> blocksOf(List<AvailabilityBlock> blocks, AvailabilityKind kind) {
		return blocks.stream().filter(block -> block.getKind() == kind).map(AvailabilityBlock::toBlock).toList();
	}

}
