package com.isandt.backend.schedule;

import java.time.LocalDate;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import com.isandt.backend.calendar.Semester;
import com.isandt.backend.user.Student;

interface KeptDayRepository extends JpaRepository<KeptDay, Long> {

	List<KeptDay> findByDateBetween(LocalDate from, LocalDate to);

	List<KeptDay> findByStudentAndSemester(Student student, Semester semester);

	@Modifying
	@Query("DELETE FROM KeptDay d WHERE d.student = :student AND d.semester = :semester AND d.date >= :from")
	void deleteFrom(Student student, Semester semester, LocalDate from);

}
