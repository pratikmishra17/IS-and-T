package com.isandt.backend.schedule;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.isandt.backend.calendar.Semester;
import com.isandt.backend.user.Student;

interface ShiftPatternRepository extends JpaRepository<ShiftPattern, Long> {

	List<ShiftPattern> findByStudentAndSemesterOrderByDayAscStartAsc(Student student, Semester semester);

	List<ShiftPattern> findBySemesterIn(Collection<Semester> semesters);

	void deleteByStudentAndSemester(Student student, Semester semester);

}
