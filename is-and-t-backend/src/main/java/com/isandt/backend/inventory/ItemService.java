package com.isandt.backend.inventory;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.isandt.backend.common.error.ConflictException;
import com.isandt.backend.common.error.NotFoundException;

/** Items: what's kept in stock, with their totals per room. */
@Service
public class ItemService {

	private final ItemRepository items;

	private final StockLevelRepository stock;

	private final InventoryTransactionRepository transactions;

	private final CatalogService catalog;

	private final PlannedItemRepository planned;

	ItemService(ItemRepository items, StockLevelRepository stock, InventoryTransactionRepository transactions,
			CatalogService catalog, PlannedItemRepository planned) {
		this.items = items;
		this.stock = stock;
		this.transactions = transactions;
		this.catalog = catalog;
		this.planned = planned;
	}

	/** Every item with its stock. Two queries in total, however many items there are. */
	@Transactional(readOnly = true)
	public List<ItemResponse> list() {
		Map<Long, List<StockLevel>> stockByItem = stock.findAllWithLocation().stream()
				.collect(Collectors.groupingBy(level -> level.getItem().getId()));
		Map<Long, Integer> reserved = reservedByItem();
		return items.findAllWithCategory().stream()
				.map(item -> ItemResponse.from(item, stockByItem.getOrDefault(item.getId(), List.of()),
						reserved.getOrDefault(item.getId(), 0)))
				.toList();
	}

	@Transactional
	public ItemResponse create(ItemDetails details) {
		Category category = catalog.findCategory(details.categoryId());
		requireNameFree(category, details.name());
		return ItemResponse.from(items.save(new Item(category, details)), List.of(), 0);
	}

	@Transactional
	public ItemResponse update(Long id, ItemDetails details) {
		Item item = find(id);
		Category category = catalog.findCategory(details.categoryId());
		boolean sameName = item.getCategory().getId().equals(category.getId())
				&& item.getName().equalsIgnoreCase(details.name().trim());
		if (!sameName) {
			requireNameFree(category, details.name());
		}
		item.update(category, details);
		return describe(item);
	}

	@Transactional
	public ItemResponse archive(Long id) {
		Item item = find(id);
		item.archive();
		return describe(item);
	}

	@Transactional
	public ItemResponse restore(Long id) {
		Item item = find(id);
		item.restore();
		return describe(item);
	}

	/** Only items that never had stock can be deleted; anything with history is archived instead. */
	@Transactional
	public void delete(Long id) {
		Item item = find(id);
		if (transactions.existsByItem(item) || planned.existsByItem(item)) {
			throw new ConflictException(item.getName() + " has stock or task history, so it can't be deleted. Archive it instead.");
		}
		items.delete(item);
	}

	ItemResponse describe(Item item) {
		return ItemResponse.from(item, stock.findByItemWithLocation(item), reservedByItem().getOrDefault(item.getId(), 0));
	}

	/** Item id → how many are set aside for upcoming tasks. */
	private Map<Long, Integer> reservedByItem() {
		return planned.findByStatus(PlannedItemStatus.RESERVED).stream()
				.collect(Collectors.groupingBy(p -> p.getItem().getId(), Collectors.summingInt(PlannedItem::getQuantityPlanned)));
	}

	Item find(Long id) {
		return items.findById(id).orElseThrow(() -> new NotFoundException("Item " + id + " not found."));
	}

	private void requireNameFree(Category category, String name) {
		if (items.existsByCategoryAndNameIgnoreCase(category, name.trim())) {
			throw new ConflictException(category.getName() + " already has an item called \"" + name.trim() + "\".");
		}
	}

}
