-- Tasks: deployments and fixes, who does them, their history, and the items they use.

CREATE TABLE tasks (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    type                VARCHAR(20)   NOT NULL CHECK (type IN ('DEPLOYMENT', 'FIX')),
    title               VARCHAR(200)  NOT NULL,
    description         VARCHAR(2000),
    start_at            TIMESTAMPTZ   NOT NULL,
    duration_minutes    INTEGER       NOT NULL CHECK (duration_minutes BETWEEN 5 AND 600),
    building            VARCHAR(100)  NOT NULL,
    room                VARCHAR(50)   NOT NULL,
    employee_name       VARCHAR(200)  NOT NULL,
    employee_email      VARCHAR(255),
    employee_phone      VARCHAR(50),
    employee_department VARCHAR(100),
    status              VARCHAR(20)   NOT NULL CHECK (status IN ('UNASSIGNED', 'ASSIGNED', 'COMPLETED', 'NOT_COMPLETED', 'CANCELLED')),
    assignee_id         BIGINT REFERENCES students (id) ON DELETE SET NULL,
    -- true when a student claimed it without being on shift for the whole task; admins see a warning
    claimed_off_shift   BOOLEAN       NOT NULL DEFAULT FALSE,
    outcome_notes       VARCHAR(2000),
    finished_at         TIMESTAMPTZ,
    parent_task_id      BIGINT REFERENCES tasks (id) ON DELETE SET NULL,
    created_by_id       BIGINT REFERENCES admins (id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ   NOT NULL,
    -- optimistic locking: bumped on every update, so two simultaneous claims can't both win
    version             INTEGER       NOT NULL DEFAULT 0,
    CHECK (status <> 'UNASSIGNED' OR assignee_id IS NULL)
);

CREATE INDEX idx_tasks_start ON tasks (start_at);
CREATE INDEX idx_tasks_assignee ON tasks (assignee_id, start_at);

-- What happened to a task, in order. Display-only, so who did it is stored as a name.
CREATE TABLE task_events (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    task_id     BIGINT        NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    type        VARCHAR(30)   NOT NULL,
    actor       VARCHAR(200)  NOT NULL,
    detail      VARCHAR(1000),
    occurred_at TIMESTAMPTZ   NOT NULL
);

CREATE INDEX idx_task_events_task ON task_events (task_id, occurred_at);

-- Items a task plans to use. While RESERVED they're set aside; on completion they become
-- FULFILLED (deducted) or BACKORDERED (not enough was used); cancelled tasks RELEASE them.
CREATE TABLE task_items (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    task_id          BIGINT      NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    item_id          BIGINT      NOT NULL REFERENCES items (id),
    location_id      BIGINT      NOT NULL REFERENCES storage_locations (id),
    quantity_planned INTEGER     NOT NULL CHECK (quantity_planned > 0),
    quantity_used    INTEGER CHECK (quantity_used >= 0),
    status           VARCHAR(20) NOT NULL CHECK (status IN ('RESERVED', 'FULFILLED', 'BACKORDERED', 'RELEASED'))
);

CREATE INDEX idx_task_items_task ON task_items (task_id);

-- Stock used in a deployment is recorded against the task and the student who did it.
ALTER TABLE inventory_transactions ADD COLUMN task_id BIGINT REFERENCES tasks (id) ON DELETE SET NULL;
ALTER TABLE inventory_transactions ADD COLUMN student_id BIGINT REFERENCES students (id) ON DELETE SET NULL;
