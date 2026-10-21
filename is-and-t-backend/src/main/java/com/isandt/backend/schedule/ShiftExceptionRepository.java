package com.isandt.backend.schedule;

import java.time.LocalDate;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.isandt.backend.user.Student;

interface ShiftExceptionRepository extends JpaRepository<ShiftException, Long> {

	List<ShiftException> findByDateBetween(LocalDate from, LocalDate to);

	List<ShiftException> findByStudentAndDateBetweenOrderByDateAsc(Student student, LocalDate from, LocalDate to);

}
