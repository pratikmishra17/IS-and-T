package com.isandt.backend.activity;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;

import com.isandt.backend.activity.ActivityEntry.Actor;
import com.isandt.backend.auth.AuthenticatedUser;
import com.isandt.backend.common.error.NotFoundException;
import com.isandt.backend.user.Account;
import com.isandt.backend.user.Accounts;

import jakarta.persistence.criteria.Predicate;
import jakarta.servlet.http.HttpServletRequest;

/**
 * The activity log: writes one entry per thing someone did, and lets admins search them.
 * Entries are written by ActivityRecorder (after every request that changes something) and on
 * logout; nothing else needs to call record(). Code that knows a better name for what a request
 * acted on (a student about to be deleted, say) calls ActivityLog.about("Sam Lee").
 */
@Service
public class ActivityLog {

	private static final Logger log = LoggerFactory.getLogger(ActivityLog.class);

	/** Request attributes the recorder reads: what the request acted on, and why it failed. */
	static final String TARGET = ActivityLog.class.getName() + ".target";

	static final String REASON = ActivityLog.class.getName() + ".reason";

	static final String ACTOR = ActivityLog.class.getName() + ".actor";

	static final int PAGE_SIZE = 50;

	private final ActivityRepository entries;

	private final Accounts accounts;

	private final Clock clock;

	ActivityLog(ActivityRepository entries, Accounts accounts, Clock clock) {
		this.entries = entries;
		this.accounts = accounts;
		this.clock = clock;
	}

	/**
	 * Names what the current request is acting on, for its log entry: "Printer offline → Sam Lee".
	 * Wins over the name the recorder would guess from the response. Does nothing outside a request.
	 */
	public static void about(String target) {
		RequestAttributes request = RequestContextHolder.getRequestAttributes();
		if (request != null && target != null) {
			request.setAttribute(TARGET, target, RequestAttributes.SCOPE_REQUEST);
		}
	}

	/**
	 * Who this request acts for, when that isn't whoever is logged in on this browser: someone
	 * setting their password from an email link isn't logged in (or someone else is, on a shared
	 * computer), but the entry should name them.
	 */
	public static void actingAs(Account account) {
		RequestAttributes request = RequestContextHolder.getRequestAttributes();
		if (request != null && account != null) {
			request.setAttribute(ACTOR, new Actor(account.getRole().name(), account.getId(),
					(account.getFirstName() + " " + account.getLastName()).strip(), account.getEmail()),
					RequestAttributes.SCOPE_REQUEST);
		}
	}

	/**
	 * Writes one entry, in its own transaction: it's saved even when the request itself failed
	 * (that's worth seeing too), and a problem here never undoes what the person did.
	 */
	@Transactional(propagation = Propagation.REQUIRES_NEW)
	public void record(AuthenticatedUser user, String action, String target, String method, String path, int status,
			String reason, String ipAddress) {
		record(actorOf(user), action, target, method, path, status, reason, ipAddress);
	}

	@Transactional(propagation = Propagation.REQUIRES_NEW)
	void record(Actor actor, String action, String target, String method, String path, int status, String reason,
			String ipAddress) {
		entries.save(new ActivityEntry(Instant.now(clock), actor, action, target, method, path, status, reason, ipAddress));
	}

	/** Logging out is handled by Spring Security before any controller, so SecurityConfig calls this. */
	public void loggedOut(HttpServletRequest request, Authentication authentication) {
		if (authentication != null && authentication.getPrincipal() instanceof AuthenticatedUser user) {
			try {
				record(user, "Logged out", null, request.getMethod(), request.getRequestURI(), 200, null,
						request.getRemoteAddr());
			}
			catch (RuntimeException problem) {
				log.warn("Couldn't write the logout to the activity log: {}", problem.getMessage());
			}
		}
	}

	/**
	 * A page of entries, newest first. who: "admins", "students", "nobody" (not logged in) or
	 * anything else for everyone; failedOnly: only what didn't go through; text: matched against
	 * the person's name and email, what they did, and what they did it to.
	 */
	@Transactional(readOnly = true)
	public ActivityPage search(String text, String who, boolean failedOnly, int page) {
		Specification<ActivityEntry> filter = (root, query, cb) -> {
			List<Predicate> where = new ArrayList<>();
			switch (who == null ? "" : who) {
				case "admins" -> where.add(cb.equal(root.get("actorRole"), "ADMIN"));
				case "students" -> where.add(cb.equal(root.get("actorRole"), "STUDENT"));
				case "nobody" -> where.add(cb.isNull(root.get("actorRole")));
				default -> {
				}
			}
			if (failedOnly) {
				where.add(cb.or(cb.lessThan(root.get("status"), 200), cb.greaterThanOrEqualTo(root.get("status"), 300)));
			}
			if (text != null && !text.isBlank()) {
				String like = "%" + text.strip().toLowerCase(Locale.ROOT).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
				where.add(cb.or(List.of("actorName", "actorEmail", "action", "target").stream()
						.map(field -> cb.like(cb.lower(root.get(field)), like, '\\'))
						.toArray(Predicate[]::new)));
			}
			return cb.and(where.toArray(Predicate[]::new));
		};
		Page<ActivityEntry> found = entries.findAll(filter, PageRequest.of(Math.max(0, page), PAGE_SIZE,
				Sort.by(Sort.Order.desc("occurredAt"), Sort.Order.desc("id"))));
		return new ActivityPage(found.map(ActivityResponse::from).getContent(), found.hasNext(), found.getTotalElements());
	}

	/** Who the logged-in person is, with their name as it is right now. */
	private Actor actorOf(AuthenticatedUser user) {
		if (user == null) {
			return null;
		}
		String name = null;
		try {
			Account account = accounts.find(user.getRole(), user.getId());
			name = (account.getFirstName() + " " + account.getLastName()).strip();
		}
		catch (NotFoundException gone) {
			// They deleted their own account in this request: the email still says who it was.
		}
		return new Actor(user.getRole().name(), user.getId(), name, user.getUsername());
	}

}
