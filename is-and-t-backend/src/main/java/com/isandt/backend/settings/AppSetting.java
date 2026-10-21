package com.isandt.backend.settings;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** One setting. The key is the primary key: there's exactly one row per setting. */
@Entity
@Table(name = "app_settings")
class AppSetting {

	@Id
	@Column(name = "setting_key")
	private String key;

	@Column(name = "setting_value", nullable = false)
	private String value;

	protected AppSetting() {
	}

	AppSetting(String key, String value) {
		this.key = key;
		this.value = value;
	}

	String getValue() {
		return value;
	}

	void setValue(String value) {
		this.value = value;
	}

}
