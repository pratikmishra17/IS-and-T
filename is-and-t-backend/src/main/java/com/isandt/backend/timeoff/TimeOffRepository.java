package com.isandt.backend.timeoff;

import java.time.LocalDate;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.isandt.backend.user.Student;

interface TimeOffRepository extends JpaRepository<TimeOffRequest, Long> {

	@Query("select r from TimeOffRequest r join fetch r.student where r.status = ?1 order by r.date, r.start")
	List<TimeOffRequest> findByStatusWithStudent(TimeOffStatus status);

	List<TimeOffRequest> findByStudentAndDateGreaterThanEqualOrderByDateDesc(Student student, LocalDate from);

	long countByStatus(TimeOffStatus status);

}
