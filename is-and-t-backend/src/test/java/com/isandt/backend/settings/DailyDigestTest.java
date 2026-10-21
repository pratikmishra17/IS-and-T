package com.isandt.backend.settings;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.isandt.backend.inventory.ItemResponse;
import com.isandt.backend.inventory.ItemService;
import com.isandt.backend.inventory.TrackingType;
import com.isandt.backend.notification.EmailMessage;
import com.isandt.backend.notification.EmailSender;
import com.isandt.backend.task.AdminTaskService;
import com.isandt.backend.user.Admin;
import com.isandt.backend.user.AdminRepository;

class DailyDigestTest {

	private static final ZoneId CLEVELAND = ZoneId.of("America/New_York");

	private static final LocalDate WEDNESDAY = LocalDate.of(2026, 10, 21);

	private final SettingsService settings = mock(SettingsService.class);

	private final AdminTaskService tasks = mock(AdminTaskService.class);

	private final ItemService items = mock(ItemService.class);

	private final AdminRepository admins = mock(AdminRepository.class);

	private final EmailSender sender = mock(EmailSender.class);

	private final Admin ada = new Admin("ada@example.com", "Ada", "Admin", null);

	@BeforeEach
	void adaGetsTheDigestAtEight() {
		ada.setReceivesDigest(true);
		when(admins.findAllByOrderByLastNameAscFirstNameAsc()).thenReturn(List.of(ada));
		when(settings.digestTime()).thenReturn(LocalTime.of(8, 0));
		when(tasks.list(any(), any(), any())).thenReturn(List.of());
		when(tasks.backorders()).thenReturn(List.of());
		when(items.list()).thenReturn(List.of(new ItemResponse(1L, 1L, "Cables", "HDMI cable", null, null, TrackingType.COUNT, 5,
				Map.of(), false, 2, 0, 2, true, List.of())));
	}

	@Test
	void beforeTheDigestTimeNothingIsSent() {
		when(settings.digestLastSent()).thenReturn(WEDNESDAY.minusDays(1));

		digestAt("07:59").tick();

		verify(sender, never()).send(any());
	}

	@Test
	void afterTheDigestTimeItIsSentOnceAndListsLowStock() {
		when(settings.digestLastSent()).thenReturn(WEDNESDAY.minusDays(1));

		digestAt("08:00").tick();

		ArgumentCaptor<EmailMessage> email = ArgumentCaptor.forClass(EmailMessage.class);
		verify(sender).send(email.capture());
		assertThat(email.getValue().to()).isEqualTo("ada@example.com");
		assertThat(email.getValue().body()).contains("HDMI cable: 2 left");
		verify(settings).markDigestSent(WEDNESDAY);
	}

	@Test
	void alreadySentTodayMeansNotAgain() {
		when(settings.digestLastSent()).thenReturn(WEDNESDAY);

		digestAt("09:30").tick();

		verify(sender, times(0)).send(any());
	}

	private DailyDigest digestAt(String time) {
		Clock clock = Clock.fixed(WEDNESDAY.atTime(LocalTime.parse(time)).atZone(CLEVELAND).toInstant(), CLEVELAND);
		return new DailyDigest(settings, tasks, items, admins, sender, "http://localhost:4200", clock);
	}

}
