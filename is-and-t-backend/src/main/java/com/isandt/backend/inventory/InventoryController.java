package com.isandt.backend.inventory;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.isandt.backend.activity.Activity;
import com.isandt.backend.auth.AuthenticatedUser;

import jakarta.validation.Valid;

/** Admin portal: inventory. Admins only (/api/admin/**). */
@RestController
@RequestMapping("/api/admin/inventory")
public class InventoryController {

	private final CatalogService catalog;

	private final ItemService itemService;

	private final StockService stockService;

	InventoryController(CatalogService catalog, ItemService itemService, StockService stockService) {
		this.catalog = catalog;
		this.itemService = itemService;
		this.stockService = stockService;
	}

	// ---- Categories ----

	@GetMapping("/categories")
	List<CategoryResponse> categories() {
		return catalog.categories();
	}

	@Activity("Added an inventory category")
	@PostMapping("/categories")
	@ResponseStatus(HttpStatus.CREATED)
	CategoryResponse createCategory(@Valid @RequestBody CategoryRequest request) {
		return catalog.createCategory(request);
	}

	@Activity("Renamed an inventory category")
	@PutMapping("/categories/{id}")
	CategoryResponse renameCategory(@PathVariable Long id, @Valid @RequestBody CategoryRequest request) {
		return catalog.renameCategory(id, request);
	}

	@Activity("Deleted an inventory category")
	@DeleteMapping("/categories/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void deleteCategory(@PathVariable Long id) {
		catalog.deleteCategory(id);
	}

	// ---- Storage locations ----

	@GetMapping("/locations")
	List<LocationResponse> locations() {
		return catalog.locations();
	}

	@Activity("Added a storage location")
	@PostMapping("/locations")
	@ResponseStatus(HttpStatus.CREATED)
	LocationResponse createLocation(@Valid @RequestBody LocationRequest request) {
		return catalog.createLocation(request);
	}

	@Activity("Changed a storage location")
	@PutMapping("/locations/{id}")
	LocationResponse updateLocation(@PathVariable Long id, @Valid @RequestBody LocationRequest request) {
		return catalog.updateLocation(id, request);
	}

	@Activity("Deleted a storage location")
	@DeleteMapping("/locations/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void deleteLocation(@PathVariable Long id) {
		catalog.deleteLocation(id);
	}

	// ---- Items ----

	@GetMapping("/items")
	List<ItemResponse> items() {
		return itemService.list();
	}

	@Activity("Added an inventory item")
	@PostMapping("/items")
	@ResponseStatus(HttpStatus.CREATED)
	ItemResponse createItem(@Valid @RequestBody ItemDetails details, @AuthenticationPrincipal AuthenticatedUser admin) {
		return stockService.createWithStock(details, admin.getId());
	}

	@Activity("Changed an inventory item")
	@PutMapping("/items/{id}")
	ItemResponse updateItem(@PathVariable Long id, @Valid @RequestBody ItemDetails details) {
		return itemService.update(id, details);
	}

	@Activity("Archived an inventory item")
	@PostMapping("/items/{id}/archive")
	ItemResponse archiveItem(@PathVariable Long id) {
		return itemService.archive(id);
	}

	@Activity("Restored an inventory item")
	@PostMapping("/items/{id}/restore")
	ItemResponse restoreItem(@PathVariable Long id) {
		return itemService.restore(id);
	}

	@Activity("Deleted an inventory item")
	@DeleteMapping("/items/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void deleteItem(@PathVariable Long id) {
		itemService.delete(id);
	}

	// ---- Stock ----

	@Activity("Changed the stock of an item")
	@PostMapping("/stock")
	ItemResponse adjustStock(@Valid @RequestBody StockAdjustment adjustment,
			@AuthenticationPrincipal AuthenticatedUser admin) {
		return stockService.adjust(adjustment, admin.getId());
	}

	/** GET /transactions for everything, or /transactions?itemId=3 for one item; newest first. */
	@GetMapping("/transactions")
	List<TransactionResponse> transactions(@RequestParam(required = false) Long itemId,
			@RequestParam(defaultValue = "100") int limit) {
		return stockService.history(itemId, limit);
	}

}
