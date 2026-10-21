package com.isandt.backend.schedule;

import java.time.DayOfWeek;
import java.time.LocalTime;

import com.isandt.backend.calendar.Semester;
import com.isandt.backend.user.Student;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/** One weekly block a student entered for a semester: a class, or hours they'd like to work. */
@Entity
@Table(name = "availability_blocks")
public class AvailabilityBlock {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "student_id")
	private Student student;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "semester_id")
	private Semester semester;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private AvailabilityKind kind;

	@Enumerated(EnumType.STRING)
	@Column(name = "day_of_week", nullable = false)
	private DayOfWeek day;

	@Column(name = "start_time", nullable = false)
	private LocalTime start;

	@Column(name = "end_time", nullable = false)
	private LocalTime end;

	protected AvailabilityBlock() {
	}

	AvailabilityBlock(Student student, Semester semester, AvailabilityKind kind, TimeBlock block) {
		this.student = student;
		this.semester = semester;
		this.kind = kind;
		this.day = block.day();
		this.start = block.start();
		this.end = block.end();
	}

	AvailabilityKind getKind() {
		return kind;
	}

	TimeBlock toBlock() {
		return new TimeBlock(day, start, end);
	}

}
