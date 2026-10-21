package com.isandt.backend.task;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

interface TaskEventRepository extends JpaRepository<TaskEvent, Long> {

	List<TaskEvent> findByTaskOrderByOccurredAtAscIdAsc(Task task);

}
