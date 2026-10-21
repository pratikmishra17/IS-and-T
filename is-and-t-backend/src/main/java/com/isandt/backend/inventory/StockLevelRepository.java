package com.isandt.backend.inventory;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import jakarta.persistence.LockModeType;

interface StockLevelRepository extends JpaRepository<StockLevel, Long> {

	@Query("select s from StockLevel s join fetch s.location")
	List<StockLevel> findAllWithLocation();

	@Query("select s from StockLevel s join fetch s.location where s.item = ?1")
	List<StockLevel> findByItemWithLocation(Item item);

	/**
	 * Locks the row until the transaction ends (SQL "SELECT ... FOR UPDATE"). If two admins change
	 * the same item in the same room at once, the second waits for the first, then sees its result,
	 * instead of both starting from the same old count and one change being lost.
	 */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	Optional<StockLevel> findByItemAndLocation(Item item, StorageLocation location);

	List<StockLevel> findByLocation(StorageLocation location);

	/** The same lookup without the lock, for reading only (how many are in this room?). */
	@Query("select s from StockLevel s where s.item = ?1 and s.location = ?2")
	Optional<StockLevel> findByItemAndLocationNoLock(Item item, StorageLocation location);

}
