package com.isandt.backend.schedule;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.isandt.backend.calendar.Semester;
import com.isandt.backend.user.Student;

interface ScheduleRequestRepository extends JpaRepository<ScheduleRequest, Long> {

	Optional<ScheduleRequest> findFirstByStudentAndSemesterOrderBySubmittedAtDesc(Student student, Semester semester);

	@Query("select r from ScheduleRequest r join fetch r.student join fetch r.semester where r.status = ?1 order by r.submittedAt")
	List<ScheduleRequest> findByStatusWithDetails(ScheduleRequestStatus status);

	long countBySemester(Semester semester);

}
