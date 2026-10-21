package com.isandt.backend.inventory;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

interface CategoryRepository extends JpaRepository<Category, Long> {

	List<Category> findAllByOrderByNameAsc();

	boolean existsByNameIgnoreCase(String name);

}
