package com.isandt.backend.task;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.isandt.backend.user.Student;

interface TaskOfferRepository extends JpaRepository<TaskOffer, Long> {

	List<TaskOffer> findByStatusOrderByCreatedAtAsc(TaskOffer.Status status);

	List<TaskOffer> findByTaskAndStatus(Task task, TaskOffer.Status status);

	boolean existsByTaskAndStudentAndStatus(Task task, Student student, TaskOffer.Status status);

	List<TaskOffer> findTop50ByStudentOrderByCreatedAtDesc(Student student);

}
