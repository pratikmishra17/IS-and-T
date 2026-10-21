package com.isandt.backend.inventory;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.isandt.backend.common.error.ConflictException;
import com.isandt.backend.common.error.NotFoundException;
import com.isandt.backend.user.Student;

/**
 * The items tasks plan to use. Planning reserves them (available = on hand - reserved); completing
 * the task deducts what was really used, and anything short becomes a backorder.
 */
@Service
public class ReservationService {

	private final PlannedItemRepository planned;

	private final ItemService itemService;

	private final CatalogService catalog;

	private final StockLevelRepository stock;

	private final StockService stockService;

	ReservationService(PlannedItemRepository planned, ItemService itemService, CatalogService catalog,
			StockLevelRepository stock, StockService stockService) {
		this.planned = planned;
		this.itemService = itemService;
		this.catalog = catalog;
		this.stock = stock;
		this.stockService = stockService;
	}

	/**
	 * Replaces a task's reserved items with these lines. Returns warnings (not errors) for lines
	 * there isn't enough available stock for: the task can still go ahead, stock may arrive in time.
	 */
	@Transactional
	public List<String> reserve(Long taskId, List<PlannedLine> lines) {
		planned.findByTask(taskId).stream().filter(p -> p.getStatus() == PlannedItemStatus.RESERVED).forEach(planned::delete);
		planned.flush();
		// "itemId:locationId" → how many are already reserved there; updated as this task's lines are added,
		// so two lines for the same item and room are checked together.
		Map<String, Integer> reservedAt = planned.findByStatusWithDetails(PlannedItemStatus.RESERVED).stream()
				.collect(Collectors.groupingBy(p -> key(p.getItem(), p.getLocation()),
						Collectors.summingInt(PlannedItem::getQuantityPlanned)));
		List<String> warnings = new ArrayList<>();
		for (PlannedLine line : lines) {
			Item item = itemService.find(line.itemId());
			if (item.isArchived()) {
				throw new ConflictException(item.getName() + " is archived; restore it before planning it for a task.");
			}
			StorageLocation location = catalog.findLocation(line.locationId());
			int inRoom = stock.findByItemAndLocationNoLock(item, location).map(StockLevel::getQuantityOnHand).orElse(0);
			int available = inRoom - reservedAt.getOrDefault(key(item, location), 0);
			if (available < line.quantity()) {
				warnings.add("Only " + Math.max(available, 0) + " " + item.getName() + " available in " + location.label()
						+ " (" + line.quantity() + " planned).");
			}
			planned.save(new PlannedItem(taskId, item, location, line.quantity()));
			reservedAt.merge(key(item, location), line.quantity(), Integer::sum);
		}
		return warnings;
	}

	private static String key(Item item, StorageLocation location) {
		return item.getId() + ":" + location.getId();
	}

	/** The task won't happen (cancelled, not completed, or a follow-up took over): free its items. */
	@Transactional
	public void release(Long taskId) {
		planned.findByTask(taskId).stream()
				.filter(p -> p.getStatus() == PlannedItemStatus.RESERVED || p.getStatus() == PlannedItemStatus.BACKORDERED)
				.forEach(PlannedItem::release);
	}

	/**
	 * The task was completed: deduct what was used from each room (recorded against the task and the
	 * student) and mark each line fulfilled or backordered. Returns how many lines are backordered.
	 */
	@Transactional
	public int fulfil(Long taskId, Map<Long, Integer> usedByPlannedItem, Student student) {
		int backordered = 0;
		for (PlannedItem line : planned.findByTask(taskId)) {
			if (line.getStatus() != PlannedItemStatus.RESERVED) {
				continue;
			}
			int used = usedByPlannedItem.getOrDefault(line.getId(), line.getQuantityPlanned());
			if (used < 0 || used > line.getQuantityPlanned()) {
				throw new ConflictException("Used for " + line.getItem().getName() + " must be between 0 and "
						+ line.getQuantityPlanned() + ".");
			}
			if (used > 0) {
				stockService.deductForTask(line.getItem(), line.getLocation(), used, taskId, student);
			}
			line.fulfil(used);
			if (line.getStatus() == PlannedItemStatus.BACKORDERED) {
				backordered++;
			}
		}
		return backordered;
	}

	@Transactional(readOnly = true)
	public List<PlannedItemResponse> forTask(Long taskId) {
		return planned.findByTask(taskId).stream().map(PlannedItemResponse::from).toList();
	}

	@Transactional(readOnly = true)
	public Map<Long, List<PlannedItemResponse>> forTasks(Collection<Long> taskIds) {
		if (taskIds.isEmpty()) {
			return Map.of();
		}
		return planned.findByTasks(taskIds).stream().collect(Collectors.groupingBy(PlannedItem::getTaskId,
				Collectors.mapping(PlannedItemResponse::from, Collectors.toList())));
	}

	@Transactional(readOnly = true)
	public List<BackorderResponse> backorders() {
		Map<Long, Integer> available = itemService.list().stream()
				.collect(Collectors.toMap(ItemResponse::id, ItemResponse::available));
		return planned.findByStatusWithDetails(PlannedItemStatus.BACKORDERED).stream()
				.map(p -> new BackorderResponse(p.getId(), p.getTaskId(), p.getItem().getId(), p.getItem().getName(),
						p.getLocation().getId(), p.getLocation().label(), p.missing(),
						available.getOrDefault(p.getItem().getId(), 0)))
				.toList();
	}

	/** The backordered lines of a task, as lines for its follow-up deployment. */
	@Transactional(readOnly = true)
	public List<PlannedLine> backorderedLines(Long taskId) {
		List<PlannedLine> lines = planned.findByTask(taskId).stream()
				.filter(p -> p.getStatus() == PlannedItemStatus.BACKORDERED)
				.map(p -> new PlannedLine(p.getItem().getId(), p.getLocation().getId(), p.missing()))
				.toList();
		if (lines.isEmpty()) {
			throw new NotFoundException("This task has no backordered items.");
		}
		return lines;
	}

	/** A follow-up deployment took over the backorder: it's no longer owed by the original task. */
	@Transactional
	public void resolveBackorders(Long taskId) {
		planned.findByTask(taskId).stream().filter(p -> p.getStatus() == PlannedItemStatus.BACKORDERED)
				.forEach(PlannedItem::release);
	}

}
