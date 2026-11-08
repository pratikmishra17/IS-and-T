package com.isandt.backend.inventory;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.isandt.backend.activity.ActivityLog;
import com.isandt.backend.common.error.ConflictException;
import com.isandt.backend.common.error.NotFoundException;

/** Categories and storage rooms: the lists items and stock are organised by. */
@Service
public class CatalogService {

	private final CategoryRepository categories;

	private final StorageLocationRepository locations;

	private final ItemRepository items;

	private final StockLevelRepository stock;

	private final InventoryTransactionRepository transactions;

	private final PlannedItemRepository planned;

	CatalogService(CategoryRepository categories, StorageLocationRepository locations, ItemRepository items,
			StockLevelRepository stock, InventoryTransactionRepository transactions, PlannedItemRepository planned) {
		this.categories = categories;
		this.locations = locations;
		this.items = items;
		this.stock = stock;
		this.transactions = transactions;
		this.planned = planned;
	}

	// ---- Categories ----

	@Transactional(readOnly = true)
	public List<CategoryResponse> categories() {
		return categories.findAllByOrderByNameAsc().stream()
				.map(category -> new CategoryResponse(category.getId(), category.getName(), items.countByCategory(category)))
				.toList();
	}

	@Transactional
	public CategoryResponse createCategory(CategoryRequest request) {
		requireCategoryNameFree(request.name());
		Category category = categories.save(new Category(request.name()));
		return new CategoryResponse(category.getId(), category.getName(), 0);
	}

	@Transactional
	public CategoryResponse renameCategory(Long id, CategoryRequest request) {
		Category category = findCategory(id);
		if (!category.getName().equalsIgnoreCase(request.name().trim())) {
			requireCategoryNameFree(request.name());
		}
		category.rename(request.name());
		return new CategoryResponse(category.getId(), category.getName(), items.countByCategory(category));
	}

	@Transactional
	public void deleteCategory(Long id) {
		Category category = findCategory(id);
		ActivityLog.about(category.getName());
		if (items.existsByCategory(category)) {
			throw new ConflictException("Move or delete the items in " + category.getName() + " first.");
		}
		categories.delete(category);
	}

	Category findCategory(Long id) {
		return categories.findById(id).orElseThrow(() -> new NotFoundException("Category " + id + " not found."));
	}

	private void requireCategoryNameFree(String name) {
		if (categories.existsByNameIgnoreCase(name.trim())) {
			throw new ConflictException("A category called \"" + name.trim() + "\" already exists.");
		}
	}

	// ---- Storage locations ----

	@Transactional(readOnly = true)
	public List<LocationResponse> locations() {
		return locations.findAllByOrderByBuildingAscRoomAsc().stream().map(this::describe).toList();
	}

	@Transactional
	public LocationResponse createLocation(LocationRequest request) {
		requireRoomFree(request);
		return describe(locations.save(new StorageLocation(request)));
	}

	@Transactional
	public LocationResponse updateLocation(Long id, LocationRequest request) {
		StorageLocation location = findLocation(id);
		boolean sameRoom = location.getBuilding().equalsIgnoreCase(request.building().trim())
				&& location.getRoom().equalsIgnoreCase(request.room().trim());
		if (!sameRoom) {
			requireRoomFree(request);
		}
		location.update(request);
		return describe(location);
	}

	/** A room can only go if it never held stock: its history would otherwise point at nothing. */
	@Transactional
	public void deleteLocation(Long id) {
		StorageLocation location = findLocation(id);
		ActivityLog.about(location.label());
		if (transactions.existsByLocation(location) || planned.existsByLocation(location)) {
			throw new ConflictException(location.label() + " has stock history, so it can't be deleted.");
		}
		stock.deleteAll(stock.findByLocation(location));
		locations.delete(location);
	}

	StorageLocation findLocation(Long id) {
		return locations.findById(id).orElseThrow(() -> new NotFoundException("Storage location " + id + " not found."));
	}

	private LocationResponse describe(StorageLocation location) {
		long units = stock.findByLocation(location).stream().mapToLong(StockLevel::getQuantityOnHand).sum();
		return new LocationResponse(location.getId(), location.getBuilding(), location.getRoom(),
				location.getDescription(), location.label(), units,
				transactions.existsByLocation(location) || planned.existsByLocation(location));
	}

	private void requireRoomFree(LocationRequest request) {
		if (locations.existsByBuildingIgnoreCaseAndRoomIgnoreCase(request.building().trim(), request.room().trim())) {
			throw new ConflictException(request.building().trim() + " " + request.room().trim() + " already exists.");
		}
	}

}
