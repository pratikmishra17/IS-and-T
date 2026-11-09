package com.isandt.backend.task;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.isandt.backend.user.Student;

interface TaskRepository extends JpaRepository<Task, Long> {

	/** Tasks starting in [from, to), with their assignee loaded in the same query. */
	@Query("select t from Task t left join fetch t.assignee where t.startAt >= ?1 and t.startAt < ?2 order by t.startAt")
	List<Task> findStartingBetween(Instant from, Instant to);

	@Query("select t from Task t left join fetch t.assignee where t.assignee = ?1 and t.status in ?2 and t.startAt >= ?3 order by t.startAt")
	List<Task> findForStudent(Student student, Collection<TaskStatus> statuses, Instant from);

	@Query("select t from Task t where t.status = com.isandt.backend.task.TaskStatus.UNASSIGNED and t.startAt >= ?1 order by t.startAt")
	List<Task> findUnassignedFrom(Instant from);

}
