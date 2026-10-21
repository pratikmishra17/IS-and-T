package com.isandt.backend.common.config;

import java.time.Clock;
import java.time.ZoneId;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The one Clock the whole app asks for "now" and "today", in the campus time zone. Asking a Clock
 * instead of calling LocalDate.now() directly also lets tests pretend it's any date they like.
 */
@Configuration
public class TimeConfig {

	@Bean
	Clock clock(@Value("${app.time-zone}") String timeZone) {
		return Clock.system(ZoneId.of(timeZone));
	}

}
