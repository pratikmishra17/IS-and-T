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

	/** Adds an item and, if given, its first stock in a room: both saved, or neither. */
	@Transactional
	public ItemResponse createWithStock(ItemDetails details, Long adminId) {
		ItemResponse created = itemService.create(details);
		Integer quantity = details.startingQuantity();
		if (quantity == null || quantity == 0) {
			return created;
		}
		if (details.startingLocationId() == null) {
			throw new ConflictException("Choose the room the " + quantity + " are in.");
		}
		return adjust(new StockAdjustment(created.id(), details.startingLocationId(), AdjustmentType.ADD, quantity, "Starting stock"),
				adminId);
	}

	@Transactional
	public ItemResponse adjust(StockAdjustment adjustment, Long adminId) {
		if (adjustment.type() == AdjustmentType.MOVE) {
			return move(adjustment, adminId);
		}
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
			case MOVE -> throw new IllegalStateException("handled by move()");
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
			case MOVE -> TransactionReason.MOVE;
		};
		level.change(delta);
		// getReferenceById gives a stand-in for the admin without loading them: only their id is needed.
		transactions.save(new InventoryTransaction(level, delta, reason, adjustment.note(), admins.getReferenceById(adminId)));
		return itemService.describe(item);
	}

	/** Moves stock from one room to another: two transactions (out, in), so each room's history adds up. */
	private ItemResponse move(StockAdjustment move, Long adminId) {
		Item item = itemService.find(move.itemId());
		if (item.isArchived()) {
			throw new ConflictException("Restore " + item.getName() + " before changing its stock.");
		}
		if (move.toLocationId() == null || move.toLocationId().equals(move.locationId())) {
			throw new ConflictException("Choose a different room to move them to.");
		}
		if (move.quantity() == 0) {
			throw new ConflictException("Enter how many to move.");
		}
		StorageLocation from = catalog.findLocation(move.locationId());
		StorageLocation to = catalog.findLocation(move.toLocationId());
		StockLevel source = stock.findByItemAndLocation(item, from)
				.filter(level -> level.getQuantityOnHand() >= move.quantity())
				.orElseThrow(() -> new ConflictException("There are only " + stock.findByItemAndLocation(item, from)
						.map(StockLevel::getQuantityOnHand).orElse(0) + " in " + from.label() + "."));
		StockLevel target = stock.findByItemAndLocation(item, to).orElseGet(() -> stock.save(new StockLevel(item, to)));
		String note = move.note() == null || move.note().isBlank() ? "" : ": " + move.note().strip();
		source.change(-move.quantity());
		target.change(move.quantity());
		transactions.save(new InventoryTransaction(source, -move.quantity(), TransactionReason.MOVE, "To " + to.label() + note,
				admins.getReferenceById(adminId)));
		transactions.save(new InventoryTransaction(target, move.quantity(), TransactionReason.MOVE, "From " + from.label() + note,
				admins.getReferenceById(adminId)));
		return itemService.describe(item);
	}

	/** A completed deployment used this many from this room. Recorded against the task (named in the note) and student. */
	@Transactional
	void deductForTask(Item item, StorageLocation location, int quantity, Long taskId, String taskTitle, Student student) {
		StockLevel level = stock.findByItemAndLocation(item, location)
				.orElseThrow(() -> new ConflictException("There are no " + item.getName() + " in " + location.label() + "."));
		if (level.getQuantityOnHand() < quantity) {
			throw new ConflictException("Only " + level.getQuantityOnHand() + " " + item.getName() + " are recorded in "
					+ location.label() + ", not " + quantity + ". Ask an admin to correct the count first.");
		}
		level.change(-quantity);
		transactions.save(InventoryTransaction.forTask(level, -quantity, taskId, taskTitle, student));
	}

	@Transactional(readOnly = true)
	public List<TransactionResponse> history(Long itemId, int limit) {
		PageRequest page = PageRequest.of(0, Math.clamp(limit, 1, 500));
		List<InventoryTransaction> found = itemId == null ? transactions.findLatest(page)
				: transactions.findLatestForItem(itemId, page);
		return found.stream().map(TransactionResponse::from).toList();
	}

}
