package com.isandt.backend.settings;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.isandt.backend.inventory.ItemResponse;
import com.isandt.backend.inventory.ItemService;
import com.isandt.backend.notification.EmailMessage;
import com.isandt.backend.notification.EmailSender;
import com.isandt.backend.schedule.AdminScheduleService;
import com.isandt.backend.schedule.ShiftChangeService;
import com.isandt.backend.task.AdminTaskService;
import com.isandt.backend.task.TeamTaskService;
import com.isandt.backend.task.TaskResponses.Backorder;
import com.isandt.backend.task.TaskResponses.TaskResponse;
import com.isandt.backend.task.TaskStatus;
import com.isandt.backend.timeoff.TimeOffService;
import com.isandt.backend.user.Admin;
import com.isandt.backend.user.AdminRepository;

/**
 * The weekday morning email to the chosen admins: today's unassigned tasks, those of the next few
 * days, everything waiting for an answer (time off, shift changes, offers, semester hours), low
 * stock, and backorders back in stock.
 * <p>
 * {@code @Scheduled} runs {@link #tick()} at the start of every minute on weekdays, in campus time.
 * It sends once the digest time has passed, and only once a day: the date it last went out is
 * stored, so restarting the app doesn't send it again.
 */
@Component
public class DailyDigest {

	private static final Logger log = LoggerFactory.getLogger(DailyDigest.class);

	private final SettingsService settings;

	private final AdminTaskService tasks;

	private final ItemService items;

	private final AdminRepository admins;

	private final EmailSender sender;

	private final String frontendUrl;

	private final Clock clock;

	private final TimeOffService timeOff;

	private final ShiftChangeService shiftChanges;

	private final TeamTaskService offers;

	private final AdminScheduleService hours;

	/** How many days after today the "coming up" list covers. */
	static final int COMING_DAYS = 4;

	DailyDigest(SettingsService settings, AdminTaskService tasks, ItemService items, AdminRepository admins,
			EmailSender sender, @Value("${app.frontend-url}") String frontendUrl, Clock clock, TimeOffService timeOff,
			ShiftChangeService shiftChanges, TeamTaskService offers, AdminScheduleService hours) {
		this.timeOff = timeOff;
		this.shiftChanges = shiftChanges;
		this.offers = offers;
		this.hours = hours;
		this.settings = settings;
		this.tasks = tasks;
		this.items = items;
		this.admins = admins;
		this.sender = sender;
		this.frontendUrl = frontendUrl;
		this.clock = clock;
	}

	/** "0 * * * * MON-FRI": second 0 of every minute, Monday to Friday. */
	@Scheduled(cron = "0 * * * * MON-FRI", zone = "${app.time-zone}")
	@Transactional
	public void tick() {
		LocalDate today = LocalDate.now(clock);
		if (LocalTime.now(clock).isBefore(settings.digestTime()) || !settings.digestLastSent().isBefore(today)) {
			return;
		}
		try {
			log.info("Daily digest sent to {} admin(s).", send(today));
		}
		catch (RuntimeException ex) {
			// Marked as sent anyway, so a mail outage doesn't retry (and log) every minute all day.
			log.error("The daily digest couldn't be sent today; use \"Send it now\" in Settings to retry.", ex);
		}
		settings.markDigestSent(today);
	}

	/** Sends today's digest to every active admin who receives it; returns how many. Also used by "Send it now". */
	@Transactional
	public int send(LocalDate date) {
		List<Admin> recipients = admins.findAllByOrderByLastNameAscFirstNameAsc().stream()
				.filter(admin -> admin.isActive() && admin.isReceivesDigest()).toList();
		String body = compose(date);
		String subject = "IS&T daily digest: " + date.format(DateTimeFormatter.ofPattern("EEE MMM d"));
		recipients.forEach(admin -> sender.send(new EmailMessage(admin.getEmail(), subject, "Hi " + admin.getFirstName() + ",\n\n" + body)));
		return recipients.size();
	}

	String compose(LocalDate date) {
		List<TaskResponse> unassigned = tasks.list(date, date, TaskStatus.UNASSIGNED);
		List<ItemResponse> lowStock = items.list().stream().filter(item -> item.lowStock() && !item.archived()).toList();
		List<Backorder> refillable = tasks.backorders().stream().filter(b -> b.availableNow() >= b.missing()).toList();
		List<TaskResponse> comingUp = tasks.list(date.plusDays(1), date.plusDays(COMING_DAYS), TaskStatus.UNASSIGNED);
		List<String> waiting = new ArrayList<>();
		count(waiting, timeOff.pendingCount(), "time-off request", "time-off requests");
		count(waiting, shiftChanges.pendingCount(), "shift change", "shift changes");
		count(waiting, offers.pendingOffers().size(), "offer to take a task", "offers to take a task");
		count(waiting, hours.pendingRequests().size(), "semester hours request", "semester hours requests");

		List<String> lines = new ArrayList<>();
		lines.add(section("Unassigned tasks today", unassigned.stream()
				.map(t -> t.startTime() + "–" + t.endTime() + "  " + t.title() + " (" + t.location() + ")").toList(),
				"None: every task today has someone."));
		lines.add(section("Unassigned in the next " + COMING_DAYS + " days", comingUp.stream()
				.map(t -> t.date().format(DateTimeFormatter.ofPattern("EEE MMM d", Locale.US)) + " " + t.startTime() + "–" + t.endTime()
						+ "  " + t.title() + " (" + t.location() + ")").toList(),
				"None."));
		lines.add(section("Waiting for an answer (Shifts & tasks → Student requests)", waiting, "Nothing."));
		lines.add(section("Low stock", lowStock.stream()
				.map(i -> i.name() + ": " + i.onHand() + " left (threshold " + i.lowStockThreshold() + ")").toList(),
				"Nothing is low."));
		lines.add(section("Backorders back in stock", refillable.stream()
				.map(b -> b.missing() + " × " + b.itemName() + " for " + (b.task().employee().name() == null ? b.task().location() : b.task().employee().name()) + " (from \"" + b.task().title() + "\")").toList(),
				"None."));
		boolean allClear = unassigned.isEmpty() && comingUp.isEmpty() && waiting.isEmpty() && lowStock.isEmpty() && refillable.isEmpty();
		return (allClear ? "All clear today.\n\n" : "") + String.join("\n\n", lines) + "\n\nOpen the admin portal: " + frontendUrl + "/admin";
	}

	private static void count(List<String> lines, long count, String one, String many) {
		if (count > 0) {
			lines.add(count + " " + (count == 1 ? one : many));
		}
	}

	private static String section(String title, List<String> entries, String whenEmpty) {
		return title + ":\n" + (entries.isEmpty() ? "  " + whenEmpty : "  • " + String.join("\n  • ", entries));
	}

}
