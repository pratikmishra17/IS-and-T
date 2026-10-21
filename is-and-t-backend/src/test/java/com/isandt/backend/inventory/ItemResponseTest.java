package com.isandt.backend.inventory;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

class ItemResponseTest {

	private final Item monitor = new Item(new Category("Monitors"),
			new ItemDetails(1L, "Dell P2422H", "Dell", "P2422H", 5, Map.of("Size", "24 in", " ", "ignored")));

	@Test
	void totalsAddUpAcrossRoomsAndLowStockUsesTheTotal() {
		StockLevel first = new StockLevel(monitor, new StorageLocation(new LocationRequest("RT", "1408", null)));
		first.change(3);
		StockLevel second = new StockLevel(monitor, new StorageLocation(new LocationRequest("BU", "201", null)));
		second.change(2);

		ItemResponse response = ItemResponse.from(monitor, List.of(first, second), 0);

		assertThat(response.onHand()).isEqualTo(5);
		assertThat(response.lowStock()).isTrue();
		assertThat(response.stock()).hasSize(2);
	}

	@Test
	void blankExtraFieldsAreDropped() {
		assertThat(monitor.getAttributes()).containsExactly(Map.entry("Size", "24 in"));
	}

}
