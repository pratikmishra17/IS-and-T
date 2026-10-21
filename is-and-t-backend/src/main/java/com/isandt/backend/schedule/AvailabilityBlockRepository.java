package com.isandt.backend.schedule;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.isandt.backend.calendar.Semester;
import com.isandt.backend.user.Student;

interface AvailabilityBlockRepository extends JpaRepository<AvailabilityBlock, Long> {

	List<AvailabilityBlock> findByStudentAndSemesterOrderByDayAscStartAsc(Student student, Semester semester);

	void deleteByStudentAndSemester(Student student, Semester semester);

}
