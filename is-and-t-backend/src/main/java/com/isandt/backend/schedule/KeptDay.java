package com.isandt.backend.schedule;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

import com.isandt.backend.calendar.Semester;
import com.isandt.backend.user.Student;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Embeddable;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/**
 * A day whose weekly shifts were saved before the weekly pattern changed, so the change doesn't
 * rewrite it. One-off changes (day off, extra shift, time off) still apply on top, as usual.
 */
@Entity
@Table(name = "kept_days")
class KeptDay {

	/** One kept shift's times. */
	@Embeddable
	static class Hours {

		@Column(name = "start_time", nullable = false)
		private LocalTime start;

		@Column(name = "end_time", nullable = false)
		private LocalTime end;

		protected Hours() {
		}

		Hours(LocalTime start, LocalTime end) {
			this.start = start;
			this.end = end;
		}

		LocalTime start() {
			return start;
		}

		LocalTime end() {
			return end;
		}

	}

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "student_id")
	private Student student;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "semester_id")
	private Semester semester;

	@Column(name = "day_date", nullable = false)
	private LocalDate date;

	@ElementCollection(fetch = FetchType.EAGER)
	@CollectionTable(name = "kept_day_shifts", joinColumns = @JoinColumn(name = "kept_day_id"))
	private List<Hours> shifts = new ArrayList<>();

	protected KeptDay() {
	}

	KeptDay(Student student, Semester semester, LocalDate date, List<TimeBlock> shifts) {
		this.student = student;
		this.semester = semester;
		this.date = date;
		shifts.forEach(block -> this.shifts.add(new Hours(block.start(), block.end())));
	}

	Long studentId() {
		return student.getId();
	}

	LocalDate getDate() {
		return date;
	}

	List<Hours> getShifts() {
		return shifts;
	}

}
