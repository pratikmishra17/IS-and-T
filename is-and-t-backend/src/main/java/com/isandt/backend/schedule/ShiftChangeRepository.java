package com.isandt.backend.schedule;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.isandt.backend.calendar.Semester;
import com.isandt.backend.user.Student;

interface ShiftChangeRepository extends JpaRepository<ShiftChangeRequest, Long> {

	List<ShiftChangeRequest> findByStatusOrderBySubmittedAtAsc(ShiftChangeRequest.Status status);

	List<ShiftChangeRequest> findTop50ByStudentOrderBySubmittedAtDesc(Student student);

	long countByStatus(ShiftChangeRequest.Status status);

	long countBySemester(Semester semester);

}
