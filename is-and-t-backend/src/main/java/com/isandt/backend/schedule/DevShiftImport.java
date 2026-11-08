package com.isandt.backend.schedule;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.isandt.backend.calendar.Semester;
import com.isandt.backend.calendar.SemesterService;
import com.isandt.backend.user.Student;
import com.isandt.backend.user.StudentRepository;

/**
 * Development only (@Profile("dev")): fills in the team's weekly shifts from a file
 * (dev-data/weekly-shifts.csv), so they don't have to be typed into the admin portal by hand.
 *
 * Runs at every startup, and only ever adds: a student listed in the file gets those shifts for the
 * current semester if they have no weekly shifts in it yet. Anyone who already has shifts is left
 * exactly as they are, so edits made in the admin portal are never overwritten. A student added
 * later gets their shifts at the next restart. Students are found by first name (plus a last-name
 * initial if the file gives one); who was filled in, skipped or not found is written to the log.
 */
@Component
@Profile("dev")
public class DevShiftImport implements ApplicationRunner {

	private static final Logger log = LoggerFactory.getLogger(DevShiftImport.class);

	private final StudentRepository students;

	private final ShiftPatternRepository patterns;

	private final SemesterService semesters;

	private final ApplicationEventPublisher events;

	private final Clock clock;

	private final Resource file;

	DevShiftImport(StudentRepository students, ShiftPatternRepository patterns, SemesterService semesters,
			ApplicationEventPublisher events, Clock clock,
			@Value("${app.seed.weekly-shifts:classpath:dev-data/weekly-shifts.csv}") Resource file) {
		this.students = students;
		this.patterns = patterns;
		this.semesters = semesters;
		this.events = events;
		this.clock = clock;
		this.file = file;
	}

	@Override
	@Transactional
	public void run(ApplicationArguments args) {
		// Dev convenience only: whatever goes wrong here is logged, and never stops the app from starting.
		try {
			load();
		}
		catch (IOException | RuntimeException problem) {
			log.warn("Weekly shifts from {} not loaded: {}", file.getFilename(), problem.getMessage());
		}
	}

	private void load() throws IOException {
		if (!file.exists()) {
			return;
		}
		Optional<Semester> current = semesters.containing(LocalDate.now(clock));
		if (current.isEmpty()) {
			log.info("Weekly shifts from {} not loaded: today isn't in a semester. Add one on the Calendar page, then restart.",
					file.getFilename());
			return;
		}
		Semester semester = current.get();
		List<Student> everyone = students.findAll().stream().filter(Student::isActive).toList();

		List<String> filled = new ArrayList<>();
		List<String> kept = new ArrayList<>();
		List<String> notFound = new ArrayList<>();
		read(file.getContentAsString(StandardCharsets.UTF_8)).forEach((name, shifts) -> {
			List<Student> found = everyone.stream().filter(s -> matches(name, s.getFirstName(), s.getLastName())).toList();
			if (found.size() != 1) {
				notFound.add(found.isEmpty() ? name : name + " (more than one student matches)");
				return;
			}
			Student student = found.getFirst();
			if (!patterns.findByStudentAndSemesterOrderByDayAscStartAsc(student, semester).isEmpty()) {
				kept.add(name);
				return;
			}
			ShiftRules.check(shifts, true, name + "'s shift"); // the same rules as the admin portal
			shifts.forEach(block -> patterns.save(new ShiftPattern(student, semester, block)));
			events.publishEvent(new ShiftsChanged(student.getId()));
			filled.add(name + " (" + ShiftRules.formatHours(ShiftRules.hours(shifts)) + " h)");
		});

		if (!filled.isEmpty()) {
			log.info("Weekly shifts for {} filled in from {}: {}", semester.getName(), file.getFilename(), String.join(", ", filled));
		}
		if (!kept.isEmpty()) {
			log.info("Already had weekly shifts for {}, left as they are: {}", semester.getName(), String.join(", ", kept));
		}
		if (!notFound.isEmpty()) {
			log.info("No student found for {} in {}. Add them on the Users page, then restart to fill in their shifts.",
					String.join(", ", notFound), file.getFilename());
		}
	}

	/**
	 * The file's shifts by student, in file order. Each line is "name, DAY, HH:mm, HH:mm"; blank lines
	 * and lines starting with # are skipped.
	 */
	static Map<String, List<TimeBlock>> read(String csv) {
		Map<String, List<TimeBlock>> shifts = new LinkedHashMap<>();
		String[] lines = csv.split("\\R");
		for (int i = 0; i < lines.length; i++) {
			String line = lines[i].strip();
			if (line.isEmpty() || line.startsWith("#")) {
				continue;
			}
			String[] parts = line.split("\\s*,\\s*");
			if (parts.length != 4) {
				throw new IllegalArgumentException("line " + (i + 1) + " should be \"name, DAY, start, end\": " + line);
			}
			try {
				TimeBlock block = new TimeBlock(DayOfWeek.valueOf(parts[1].toUpperCase(Locale.ROOT)),
						LocalTime.parse(parts[2]), LocalTime.parse(parts[3]));
				shifts.computeIfAbsent(parts[0], name -> new ArrayList<>()).add(block);
			}
			catch (RuntimeException badValue) {
				throw new IllegalArgumentException("line " + (i + 1) + " has a day or time that can't be read: " + line);
			}
		}
		return shifts;
	}

	/** "Adam C" matches Adam Cruz; "Hetvi" matches any Hetvi. Ignores upper and lower case. */
	static boolean matches(String name, String firstName, String lastName) {
		String[] parts = name.strip().split("\\s+", 2);
		if (!parts[0].equalsIgnoreCase(firstName.strip())) {
			return false;
		}
		return parts.length == 1 || lastName.strip().toUpperCase(Locale.ROOT).startsWith(parts[1].toUpperCase(Locale.ROOT));
	}

}
