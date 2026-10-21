package com.isandt.backend.inventory;

import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

interface InventoryTransactionRepository extends JpaRepository<InventoryTransaction, Long> {

	boolean existsByItem(Item item);

	boolean existsByLocation(StorageLocation location);

	/** Newest first; the Pageable decides how many ("the latest 100"). */
	@Query("select t from InventoryTransaction t join fetch t.item join fetch t.location left join fetch t.admin left join fetch t.student order by t.occurredAt desc")
	List<InventoryTransaction> findLatest(Pageable page);

	@Query("select t from InventoryTransaction t join fetch t.item join fetch t.location left join fetch t.admin left join fetch t.student where t.item.id = ?1 order by t.occurredAt desc")
	List<InventoryTransaction> findLatestForItem(Long itemId, Pageable page);

}
