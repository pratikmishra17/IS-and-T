-- Weekly shifts are worked out from a pattern ("every Monday 09:00-13:00"), so changing the pattern
-- used to change every week of the semester, past ones too. Before a pattern changes, the days that
-- must stay as they were (the past, and days before an "every week from ..." change starts) are
-- copied here. The calendar reads a kept day's shifts instead of the pattern.
CREATE TABLE kept_days (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id  BIGINT NOT NULL REFERENCES students (id) ON DELETE CASCADE,
    semester_id BIGINT NOT NULL REFERENCES semesters (id) ON DELETE CASCADE,
    day_date    DATE   NOT NULL,
    UNIQUE (student_id, day_date)
);

CREATE INDEX idx_kept_days_date ON kept_days (day_date);

-- A kept day's shifts (none = they weren't working that day).
CREATE TABLE kept_day_shifts (
    kept_day_id BIGINT NOT NULL REFERENCES kept_days (id) ON DELETE CASCADE,
    start_time  TIME   NOT NULL,
    end_time    TIME   NOT NULL,
    CHECK (end_time > start_time)
);

CREATE INDEX idx_kept_day_shifts_day ON kept_day_shifts (kept_day_id);
