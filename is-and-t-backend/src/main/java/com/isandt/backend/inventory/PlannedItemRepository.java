package com.isandt.backend.inventory;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

interface PlannedItemRepository extends JpaRepository<PlannedItem, Long> {

	@Query("select p from PlannedItem p join fetch p.item join fetch p.location where p.taskId = ?1 order by p.id")
	List<PlannedItem> findByTask(Long taskId);

	@Query("select p from PlannedItem p join fetch p.item join fetch p.location where p.taskId in ?1 order by p.id")
	List<PlannedItem> findByTasks(Collection<Long> taskIds);

	List<PlannedItem> findByStatus(PlannedItemStatus status);

	@Query("select p from PlannedItem p join fetch p.item join fetch p.location where p.status = ?1 order by p.id")
	List<PlannedItem> findByStatusWithDetails(PlannedItemStatus status);

	boolean existsByItem(Item item);

	boolean existsByLocation(StorageLocation location);

}
