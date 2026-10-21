package com.isandt.backend.inventory;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

interface ItemRepository extends JpaRepository<Item, Long> {

	/**
	 * "join fetch" loads each item's category in the same query. Without it, reading
	 * item.getCategory().getName() for 50 items would run 50 extra queries (the "N+1 problem").
	 */
	@Query("select i from Item i join fetch i.category c order by c.name, i.name")
	List<Item> findAllWithCategory();

	boolean existsByCategory(Category category);

	boolean existsByCategoryAndNameIgnoreCase(Category category, String name);

	long countByCategory(Category category);

}
