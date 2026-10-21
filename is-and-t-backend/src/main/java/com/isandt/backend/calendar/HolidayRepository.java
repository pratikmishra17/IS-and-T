package com.isandt.backend.calendar;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

interface HolidayRepository extends JpaRepository<Holiday, Long> {

	List<Holiday> findAllByOrderByDateAsc();

	/** A custom query in JPQL: like SQL, but written against entity and field names instead of tables. */
	@Query("select h.date from Holiday h")
	Set<LocalDate> findAllDates();

}
