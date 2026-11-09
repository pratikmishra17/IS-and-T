package com.isandt.backend.user;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface StudentRepository extends JpaRepository<Student, Long> {

	Optional<Student> findByEmail(String email);

	boolean existsByEmail(String email);

	boolean existsByStudentId(String studentId);

	Optional<Student> findByCalendarToken(String calendarToken);

	List<Student> findAllByOrderByLastNameAscFirstNameAsc();

}
