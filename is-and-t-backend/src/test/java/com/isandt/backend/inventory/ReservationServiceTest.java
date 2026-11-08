package com.isandt.backend.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import com.isandt.backend.common.error.ConflictException;

class ReservationServiceTest {

	private final PlannedItemRepository planned = mock(PlannedItemRepository.class);

	private final StockService stockService = mock(StockService.class);

	private final ReservationService service = new ReservationService(planned, mock(ItemService.class),
			mock(CatalogService.class), mock(StockLevelRepository.class), stockService);

	private final Item monitor = new Item(new Category("Monitors"), new ItemDetails(1L, "Dell P2422H", null, null, 0, Map.of()));

	private final StorageLocation room = new StorageLocation(new LocationRequest("RT", "1408", null));

	@Test
	void usingFewerThanPlannedDeductsWhatWasUsedAndBackordersTheRest() {
		PlannedItem twoMonitors = line(7L, 2);
		when(planned.findByTask(5L)).thenReturn(List.of(twoMonitors));

		int backordered = service.fulfil(5L, "Desk setup", Map.of(7L, 1), null);

		assertThat(backordered).isEqualTo(1);
		assertThat(twoMonitors.getStatus()).isEqualTo(PlannedItemStatus.BACKORDERED);
		assertThat(twoMonitors.missing()).isEqualTo(1);
		verify(stockService).deductForTask(monitor, room, 1, 5L, "Desk setup", null);
	}

	@Test
	void anItemNotMentionedCountsAsFullyUsed() {
		PlannedItem twoMonitors = line(7L, 2);
		when(planned.findByTask(5L)).thenReturn(List.of(twoMonitors));

		service.fulfil(5L, "Desk setup", Map.of(), null);

		assertThat(twoMonitors.getStatus()).isEqualTo(PlannedItemStatus.FULFILLED);
		verify(stockService).deductForTask(monitor, room, 2, 5L, "Desk setup", null);
	}

	@Test
	void usingMoreThanPlannedIsRefused() {
		when(planned.findByTask(5L)).thenReturn(List.of(line(7L, 2)));

		assertThatThrownBy(() -> service.fulfil(5L, "Desk setup", Map.of(7L, 3), null)).isInstanceOf(ConflictException.class);
		verify(stockService, never()).deductForTask(any(), any(), anyInt(), any(), any(), any());
	}

	private PlannedItem line(Long id, int quantity) {
		PlannedItem line = new PlannedItem(5L, monitor, room, quantity);
		ReflectionTestUtils.setField(line, "id", id);
		return line;
	}

}
