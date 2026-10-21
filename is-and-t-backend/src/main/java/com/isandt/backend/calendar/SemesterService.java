package com.isandt.backend.calendar;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.isandt.backend.common.error.ConflictException;
import com.isandt.backend.common.error.NotFoundException;

/**
 * Semesters, managed in the admin portal. Rules: the end isn't before the start, names are
 * unique, and semesters never overlap, so every date belongs to at most one semester.
 */
@Service
public class SemesterService {

	private final SemesterRepository semesters;

	private final Clock clock;

	SemesterService(SemesterRepository semesters, Clock clock) {
		this.semesters = semesters;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public List<SemesterResponse> list() {
		LocalDate today = LocalDate.now(clock);
		return semesters.findAllByOrderByStartDateDesc().stream().map(s -> SemesterResponse.from(s, today)).toList();
	}

	@Transactional
	public SemesterResponse create(SemesterDetails details) {
		if (semesters.existsByNameIgnoreCase(details.name().trim())) {
			throw new ConflictException("A semester called \"" + details.name().trim() + "\" already exists.");
		}
		check(details, null);
		return SemesterResponse.from(semesters.save(new Semester(details)), LocalDate.now(clock));
	}

	@Transactional
	public SemesterResponse update(Long id, SemesterDetails details) {
		Semester semester = find(id);
		if (!semester.getName().equalsIgnoreCase(details.name().trim())
				&& semesters.existsByNameIgnoreCase(details.name().trim())) {
			throw new ConflictException("A semester called \"" + details.name().trim() + "\" already exists.");
		}
		check(details, semester);
		semester.update(details);
		return SemesterResponse.from(semester, LocalDate.now(clock));
	}

	/** The semester a date falls in, if any (semesters never overlap, so there's at most one). */
	@Transactional(readOnly = true)
	public Optional<Semester> containing(LocalDate date) {
		return semesters.findAll().stream().filter(semester -> semester.contains(date)).findFirst();
	}

	/** Semesters that share at least one day with from..to (a week, for example). */
	@Transactional(readOnly = true)
	public List<Semester> overlapping(LocalDate from, LocalDate to) {
		return semesters.findAll().stream().filter(semester -> semester.overlaps(from, to)).toList();
	}

	/** The current semester and the ones after it: what students can plan their hours for. */
	@Transactional(readOnly = true)
	public List<SemesterResponse> currentAndUpcoming() {
		LocalDate today = LocalDate.now(clock);
		return semesters.findAllByOrderByStartDateDesc().reversed().stream()
				.filter(semester -> !semester.getEndDate().isBefore(today))
				.map(semester -> SemesterResponse.from(semester, today))
				.toList();
	}

	/** A semester as the API sends it, with "current" worked out for today. */
	public SemesterResponse describe(Semester semester) {
		return SemesterResponse.from(semester, LocalDate.now(clock));
	}

	@Transactional(readOnly = true)
	public Semester find(Long id) {
		return semesters.findById(id).orElseThrow(() -> new NotFoundException("Semester " + id + " not found."));
	}

	@Transactional
	public void delete(Long id) {
		semesters.delete(find(id));
	}

	/** The checks shared by create and update; "editing" is skipped when looking for overlaps. */
	private void check(SemesterDetails details, Semester editing) {
		if (details.endDate().isBefore(details.startDate())) {
			throw new ConflictException("The end date can't be before the start date.");
		}
		semesters.findAll().stream()
				.filter(other -> other != editing)
				.filter(other -> other.overlaps(details.startDate(), details.endDate()))
				.findFirst()
				.ifPresent(other -> {
					throw new ConflictException("These dates overlap " + other.getName() + " ("
							+ other.getStartDate() + " to " + other.getEndDate() + ").");
				});
	}

}
