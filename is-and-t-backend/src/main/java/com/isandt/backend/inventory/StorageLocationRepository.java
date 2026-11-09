package com.isandt.backend.inventory;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

interface StorageLocationRepository extends JpaRepository<StorageLocation, Long> {

	List<StorageLocation> findAllByOrderByBuildingAscRoomAsc();

	boolean existsByBuildingIgnoreCaseAndRoomIgnoreCase(String building, String room);

}
