package com.isandt.backend.settings;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.isandt.backend.common.error.ConflictException;
import com.isandt.backend.user.Admin;
import com.isandt.backend.user.AdminRepository;

/** The settings admins can change: digest time and recipients, and the default task length. */
@Service
public class SettingsService {

	static final String DIGEST_TIME = "digest_time";

	static final String DEFAULT_TASK_DURATION = "default_task_duration";

	static final String DIGEST_LAST_SENT = "digest_last_sent";

	private final AppSettingRepository settings;

	private final AdminRepository admins;

	SettingsService(AppSettingRepository settings, AdminRepository admins) {
		this.settings = settings;
		this.admins = admins;
	}

	@Transactional(readOnly = true)
	public SettingsResponse get() {
		return new SettingsResponse(digestTime(), Integer.parseInt(value(DEFAULT_TASK_DURATION)),
				admins.findAllByOrderByLastNameAscFirstNameAsc().stream()
					.map(a -> new SettingsResponse.Recipient(a.getId(), a.getFirstName() + " " + a.getLastName(), a.getEmail(),
							a.isActive(), a.isReceivesDigest()))
					.toList());
	}

	@Transactional
	public SettingsResponse update(SettingsRequest request) {
		Set<Long> recipients = new HashSet<>(request.digestRecipientIds());
		List<Admin> all = admins.findAll();
		if (all.stream().noneMatch(a -> recipients.contains(a.getId()) && a.isActive())) {
			throw new ConflictException("Choose at least one active admin to receive the daily digest.");
		}
		all.forEach(admin -> admin.setReceivesDigest(recipients.contains(admin.getId())));
		set(DIGEST_TIME, request.digestTime().toString());
		set(DEFAULT_TASK_DURATION, String.valueOf(request.defaultTaskDuration()));
		return get();
	}

	@Transactional(readOnly = true)
	public LocalTime digestTime() {
		return LocalTime.parse(value(DIGEST_TIME));
	}

	@Transactional(readOnly = true)
	LocalDate digestLastSent() {
		return LocalDate.parse(value(DIGEST_LAST_SENT));
	}

	@Transactional
	void markDigestSent(LocalDate date) {
		set(DIGEST_LAST_SENT, date.toString());
	}

	private String value(String key) {
		return settings.findById(key).map(AppSetting::getValue)
				.orElseThrow(() -> new IllegalStateException("Missing setting " + key + " (see migration V9)"));
	}

	private void set(String key, String value) {
		settings.findById(key).ifPresentOrElse(setting -> setting.setValue(value), () -> settings.save(new AppSetting(key, value)));
	}

}
