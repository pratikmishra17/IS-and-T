package com.isandt.backend.activity;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

interface ActivityRepository extends JpaRepository<ActivityEntry, Long>, JpaSpecificationExecutor<ActivityEntry> {
}
