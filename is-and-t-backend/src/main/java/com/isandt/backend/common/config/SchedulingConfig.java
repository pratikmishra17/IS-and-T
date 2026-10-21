package com.isandt.backend.common.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Turns on @Scheduled methods (the daily digest). */
@Configuration
@EnableScheduling
public class SchedulingConfig {
}
