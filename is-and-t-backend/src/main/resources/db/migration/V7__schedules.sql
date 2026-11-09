-- Schedules: what students can't do (classes) and would like to do (preferred hours), the weekly
-- shifts an admin approves, and one-off changes to them.

CREATE TABLE availability_blocks (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id  BIGINT      NOT NULL REFERENCES students (id) ON DELETE CASCADE,
    semester_id BIGINT      NOT NULL REFERENCES semesters (id) ON DELETE CASCADE,
    kind        VARCHAR(20) NOT NULL CHECK (kind IN ('CLASS', 'PREFERRED')),
    day_of_week VARCHAR(10) NOT NULL CHECK (day_of_week IN ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY')),
    start_time  TIME        NOT NULL,
    end_time    TIME        NOT NULL,
    CHECK (end_time > start_time)
);

CREATE INDEX idx_availability_student_semester ON availability_blocks (student_id, semester_id);

CREATE TABLE schedule_requests (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id     BIGINT      NOT NULL REFERENCES students (id) ON DELETE CASCADE,
    semester_id    BIGINT      NOT NULL REFERENCES semesters (id) ON DELETE CASCADE,
    status         VARCHAR(30) NOT NULL CHECK (status IN ('SUBMITTED', 'APPROVED', 'APPROVED_WITH_CHANGES')),
    submitted_at   TIMESTAMPTZ NOT NULL,
    reviewed_by_id BIGINT REFERENCES admins (id) ON DELETE SET NULL,
    reviewed_at    TIMESTAMPTZ
);

-- Weekly shifts: Monday to Friday only.
CREATE TABLE shift_patterns (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id  BIGINT      NOT NULL REFERENCES students (id) ON DELETE CASCADE,
    semester_id BIGINT      NOT NULL REFERENCES semesters (id) ON DELETE CASCADE,
    day_of_week VARCHAR(10) NOT NULL CHECK (day_of_week IN ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY')),
    start_time  TIME        NOT NULL,
    end_time    TIME        NOT NULL,
    CHECK (end_time > start_time)
);

CREATE INDEX idx_shift_patterns_semester ON shift_patterns (semester_id, student_id);

-- One date: CANCEL = no shifts that day (no times); EXTRA = an added shift (with times).
CREATE TABLE shift_exceptions (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id    BIGINT      NOT NULL REFERENCES students (id) ON DELETE CASCADE,
    shift_date    DATE        NOT NULL,
    type          VARCHAR(10) NOT NULL CHECK (type IN ('CANCEL', 'EXTRA')),
    start_time    TIME,
    end_time      TIME,
    reason        VARCHAR(255),
    created_by_id BIGINT REFERENCES admins (id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL,
    CHECK ((type = 'CANCEL' AND start_time IS NULL AND end_time IS NULL)
        OR (type = 'EXTRA' AND start_time IS NOT NULL AND end_time > start_time))
);

CREATE INDEX idx_shift_exceptions_date ON shift_exceptions (shift_date, student_id);
