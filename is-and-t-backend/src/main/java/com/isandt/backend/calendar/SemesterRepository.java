package com.isandt.backend.calendar;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

interface SemesterRepository extends JpaRepository<Semester, Long> {

	List<Semester> findAllByOrderByStartDateDesc();

	boolean existsByNameIgnoreCase(String name);

}
