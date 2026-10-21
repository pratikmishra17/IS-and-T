package com.isandt.backend.settings;

import org.springframework.data.jpa.repository.JpaRepository;

interface AppSettingRepository extends JpaRepository<AppSetting, String> {
}
