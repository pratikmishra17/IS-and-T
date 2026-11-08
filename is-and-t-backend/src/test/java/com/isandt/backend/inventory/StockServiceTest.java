package com.isandt.backend.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.isandt.backend.common.error.ConflictException;
import com.isandt.backend.user.AdminRepository;

class StockServiceTest {

	private final StockLevelRepository stock = mock(StockLevelRepository.class);

	private final InventoryTransactionRepository transactions = mock(InventoryTransactionRepository.class);

	private final ItemService itemService = mock(ItemService.class);

	private final CatalogService catalog = mock(CatalogService.class);

	private final StockService service = new StockService(stock, transactions, itemService, catalog,
			mock(AdminRepository.class));

	private final Item keyboard = new Item(new Category("Keyboards"),
			new ItemDetails(1L, "Logitech K120", "Logitech", "K120", 5, Map.of()));

	private final StorageLocation room = new StorageLocation(new LocationRequest("Rhodes Tower", "1408", null));

	private StockLevel level;

	@BeforeEach
	void tenKeyboardsInTheRoom() {
		level = new StockLevel(keyboard, room);
		level.change(10);
		when(itemService.find(1L)).thenReturn(keyboard);
		when(catalog.findLocation(2L)).thenReturn(room);
		when(stock.findByItemAndLocation(keyboard, room)).thenReturn(Optional.of(level));
	}

	@Test
	void addingRecordsARestockTransaction() {
		service.adjust(new StockAdjustment(1L, 2L, AdjustmentType.ADD, 4, "Delivery"), 9L);

		assertThat(level.getQuantityOnHand()).isEqualTo(14);
		ArgumentCaptor<InventoryTransaction> saved = ArgumentCaptor.forClass(InventoryTransaction.class);
		verify(transactions).save(saved.capture());
		assertThat(saved.getValue().getDelta()).isEqualTo(4);
		assertThat(saved.getValue().getReason()).isEqualTo(TransactionReason.RESTOCK);
	}

	@Test
	void settingACountRecordsTheDifference() {
		service.adjust(new StockAdjustment(1L, 2L, AdjustmentType.SET, 7, "Counted"), 9L);

		assertThat(level.getQuantityOnHand()).isEqualTo(7);
		ArgumentCaptor<InventoryTransaction> saved = ArgumentCaptor.forClass(InventoryTransaction.class);
		verify(transactions).save(saved.capture());
		assertThat(saved.getValue().getDelta()).isEqualTo(-3);
		assertThat(saved.getValue().getReason()).isEqualTo(TransactionReason.ADJUSTMENT);
	}

	@Test
	void movingTakesThemOutOfOneRoomAndPutsThemInTheOther() {
		StorageLocation closet = new StorageLocation(new LocationRequest("Fenn Tower", "404", null));
		StockLevel closetLevel = new StockLevel(keyboard, closet);
		when(catalog.findLocation(3L)).thenReturn(closet);
		when(stock.findByItemAndLocation(keyboard, closet)).thenReturn(Optional.of(closetLevel));

		service.adjust(new StockAdjustment(1L, 2L, AdjustmentType.MOVE, 4, null, 3L), 9L);

		assertThat(level.getQuantityOnHand()).isEqualTo(6);
		assertThat(closetLevel.getQuantityOnHand()).isEqualTo(4);
		ArgumentCaptor<InventoryTransaction> saved = ArgumentCaptor.forClass(InventoryTransaction.class);
		verify(transactions, org.mockito.Mockito.times(2)).save(saved.capture());
		assertThat(saved.getAllValues()).extracting(InventoryTransaction::getDelta).containsExactly(-4, 4);
		assertThat(saved.getAllValues()).extracting(InventoryTransaction::getReason).containsOnly(TransactionReason.MOVE);

		assertThatThrownBy(() -> service.adjust(new StockAdjustment(1L, 2L, AdjustmentType.MOVE, 7, null, 3L), 9L))
			.isInstanceOf(ConflictException.class).hasMessageContaining("only 6");
		assertThatThrownBy(() -> service.adjust(new StockAdjustment(1L, 2L, AdjustmentType.MOVE, 1, null, 2L), 9L))
			.isInstanceOf(ConflictException.class).hasMessageContaining("different room");
	}

	@Test
	void youCantRemoveMoreThanTheRoomHas() {
		assertThatThrownBy(() -> service.adjust(new StockAdjustment(1L, 2L, AdjustmentType.REMOVE, 11, null), 9L))
			.isInstanceOf(ConflictException.class).hasMessageContaining("only 10");
		assertThat(level.getQuantityOnHand()).isEqualTo(10);
		verify(transactions, never()).save(any());
	}

	@Test
	void archivedItemsCantChange() {
		keyboard.archive();

		assertThatThrownBy(() -> service.adjust(new StockAdjustment(1L, 2L, AdjustmentType.ADD, 1, null), 9L))
			.isInstanceOf(ConflictException.class);
	}

}
