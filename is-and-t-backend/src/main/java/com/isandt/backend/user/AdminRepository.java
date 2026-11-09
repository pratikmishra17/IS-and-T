package com.isandt.backend.user;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface AdminRepository extends JpaRepository<Admin, Long> {

	Optional<Admin> findByEmail(String email);

	boolean existsByEmail(String email);

	List<Admin> findAllByOrderByLastNameAscFirstNameAsc();

}
