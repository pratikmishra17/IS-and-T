-- Time off. Whole days off (CANCEL) already existed; OFF is time off for part of a day, with times.
-- Students can now ask for either, and an admin approves or declines.

-- Replace shift_exceptions' CHECK constraints. They were created without names, so look them up
-- instead of guessing what PostgreSQL called them.
DO $$
DECLARE c record;
BEGIN
    FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'shift_exceptions'::regclass AND contype = 'c' LOOP
        EXECUTE format('ALTER TABLE shift_exceptions DROP CONSTRAINT %I', c.conname);
    END LOOP;
END $$;

ALTER TABLE shift_exceptions ADD CONSTRAINT shift_exceptions_type_check
    CHECK (type IN ('CANCEL', 'EXTRA', 'OFF'));
ALTER TABLE shift_exceptions ADD CONSTRAINT shift_exceptions_times_check
    CHECK ((type = 'CANCEL' AND start_time IS NULL AND end_time IS NULL)
        OR (type IN ('EXTRA', 'OFF') AND start_time IS NOT NULL AND end_time > start_time));

-- A student asking for time off: a whole day (no times) or part of one.
CREATE TABLE time_off_requests (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id     BIGINT       NOT NULL REFERENCES students (id) ON DELETE CASCADE,
    off_date       DATE         NOT NULL,
    start_time     TIME,
    end_time       TIME,
    reason         VARCHAR(500),
    status         VARCHAR(20)  NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'DECLINED', 'WITHDRAWN')),
    submitted_at   TIMESTAMPTZ  NOT NULL,
    reviewed_by_id BIGINT REFERENCES admins (id) ON DELETE SET NULL,
    reviewed_at    TIMESTAMPTZ,
    review_note    VARCHAR(500),
    CHECK ((start_time IS NULL AND end_time IS NULL) OR (start_time IS NOT NULL AND end_time > start_time))
);

CREATE INDEX idx_time_off_requests_status ON time_off_requests (status, off_date);
