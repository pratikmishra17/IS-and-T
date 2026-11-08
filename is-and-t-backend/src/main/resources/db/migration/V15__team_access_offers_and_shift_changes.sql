-- The student portal's Team page: every student sees everyone's shifts and tasks. What else they
-- may do with tasks is set per student by an admin:
--   VIEW     look only (plus offering to take a task, and asking for shift changes)
--   COMPLETE also mark any task done or not done
--   EDIT     also create, change, assign and cancel tasks, like an admin on the Planner
ALTER TABLE students
    ADD COLUMN task_access VARCHAR(10) NOT NULL DEFAULT 'VIEW' CHECK (task_access IN ('VIEW', 'COMPLETE', 'EDIT'));

-- "I can do this": a student offering to take a task. An admin accepts (the task becomes theirs)
-- or declines.
CREATE TABLE task_offers (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    task_id        BIGINT       NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    student_id     BIGINT       NOT NULL REFERENCES students (id) ON DELETE CASCADE,
    note           VARCHAR(500),
    status         VARCHAR(10)  NOT NULL CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN')),
    created_at     TIMESTAMPTZ  NOT NULL,
    reviewed_by_id BIGINT REFERENCES admins (id) ON DELETE SET NULL,
    reviewed_at    TIMESTAMPTZ
);

CREATE INDEX idx_task_offers_status ON task_offers (status, created_at);
-- One open offer per student per task
CREATE UNIQUE INDEX uq_task_offers_pending ON task_offers (task_id, student_id) WHERE status = 'PENDING';

-- A student asking to change their shifts for one day:
--   ONE_DAY    only on change_date (becomes one-off changes for that date when approved)
--   EVERY_WEEK every week from now on, on day_of_week (replaces that weekday's weekly shifts)
-- The new hours are the blocks below; no blocks means "not working that day".
CREATE TABLE shift_change_requests (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id     BIGINT       NOT NULL REFERENCES students (id) ON DELETE CASCADE,
    semester_id    BIGINT       NOT NULL REFERENCES semesters (id) ON DELETE CASCADE,
    scope          VARCHAR(10)  NOT NULL CHECK (scope IN ('ONE_DAY', 'EVERY_WEEK')),
    change_date    DATE         NOT NULL, -- the day picked; for EVERY_WEEK, the first week it applies
    day_of_week    VARCHAR(10)  NOT NULL CHECK (day_of_week IN ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY')),
    note           VARCHAR(500),
    status         VARCHAR(10)  NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'DECLINED', 'WITHDRAWN')),
    submitted_at   TIMESTAMPTZ  NOT NULL,
    reviewed_by_id BIGINT REFERENCES admins (id) ON DELETE SET NULL,
    reviewed_at    TIMESTAMPTZ,
    review_note    VARCHAR(500)
);

CREATE INDEX idx_shift_change_requests_status ON shift_change_requests (status, submitted_at);

CREATE TABLE shift_change_blocks (
    request_id BIGINT NOT NULL REFERENCES shift_change_requests (id) ON DELETE CASCADE,
    position   INT    NOT NULL,
    start_time TIME   NOT NULL,
    end_time   TIME   NOT NULL,
    PRIMARY KEY (request_id, position),
    CHECK (end_time > start_time)
);
