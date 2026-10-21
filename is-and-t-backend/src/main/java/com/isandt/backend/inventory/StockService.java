package com.isandt.backend.inventory;

import java.util.List;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.isandt.backend.common.error.ConflictException;
import com.isandt.backend.user.AdminRepository;
import com.isandt.backend.user.Student;

/**
 * Every change to a stock count goes through here, and each one writes an InventoryTransaction,
 * so the history always explains the current numbers.
 */
@Service
public class StockService {

	private final StockLevelRepository stock;

	private final InventoryTransactionRepository transactions;

	private final ItemService itemService;

	private final CatalogService catalog;

	private final AdminRepository admins;

	StockService(StockLevelRepository stock, InventoryTransactionRepository transactions, ItemService itemService,
			CatalogService catalog, AdminRepository admins) {
		this.stock = stock;
		this.transactions = transactions;
		this.itemService = itemService;
		this.catalog = catalog;
		this.admins = admins;
	}

	@Transactional
	public ItemResponse adjust(StockAdjustment adjustment, Long adminId) {
		Item item = itemService.find(adjustment.itemId());
		if (item.isArchived()) {
			throw new ConflictException("Restore " + item.getName() + " before changing its stock.");
		}
		StorageLocation location = catalog.findLocation(adjustment.locationId());
		StockLevel level = stock.findByItemAndLocation(item, location)
				.orElseGet(() -> stock.save(new StockLevel(item, location)));

		int current = level.getQuantityOnHand();
		int quantity = adjustment.quantity();
		int delta = switch (adjustment.type()) {
			case ADD -> quantity;
			case REMOVE -> -quantity;
			case SET -> quantity - current;
		};
		if (adjustment.type() != AdjustmentType.SET && quantity == 0) {
			throw new ConflictException("Enter how many to " + (adjustment.type() == AdjustmentType.ADD ? "add." : "remove."));
		}
		if (delta == 0) {
			throw new ConflictException(location.label() + " already has " + current + ". Nothing changed.");
		}
		if (current + delta < 0) {
			throw new ConflictException("There are only " + current + " in " + location.label() + ".");
		}

		TransactionReason reason = switch (adjustment.type()) {
			case ADD -> TransactionReason.RESTOCK;
			case REMOVE -> TransactionReason.REMOVAL;
			case SET -> TransactionReason.ADJUSTMENT;
		};
		level.change(delta);
		// getReferenceById gives a stand-in for the admin without loading them: only their id is needed.
		transactions.save(new InventoryTransaction(level, delta, reason, adjustment.note(), admins.getReferenceById(adminId)));
		return itemService.describe(item);
	}

	/** A completed deployment used this many from this room. Recorded against the task and student. */
	@Transactional
	void deductForTask(Item item, StorageLocation location, int quantity, Long taskId, Student student) {
		StockLevel level = stock.findByItemAndLocation(item, location)
				.orElseThrow(() -> new ConflictException("There are no " + item.getName() + " in " + location.label() + "."));
		if (level.getQuantityOnHand() < quantity) {
			throw new ConflictException("Only " + level.getQuantityOnHand() + " " + item.getName() + " are recorded in "
					+ location.label() + ", not " + quantity + ". Ask an admin to correct the count first.");
		}
		level.change(-quantity);
		transactions.save(InventoryTransaction.forTask(level, -quantity, taskId, student));
	}

	@Transactional(readOnly = true)
	public List<TransactionResponse> history(Long itemId, int limit) {
		PageRequest page = PageRequest.of(0, Math.clamp(limit, 1, 500));
		List<InventoryTransaction> found = itemId == null ? transactions.findLatest(page)
				: transactions.findLatestForItem(itemId, page);
		return found.stream().map(TransactionResponse::from).toList();
	}

}
