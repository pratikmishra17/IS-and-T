-- The activity log: one row for everything anyone did in the app (every request that changed
-- something, plus logging in and out), for admins to look through.
-- Who did it is copied in (name, email), so an entry still reads right after the account is renamed
-- or removed. Request bodies are never stored, so no passwords end up here.

CREATE TABLE activity_log (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at TIMESTAMPTZ  NOT NULL,
    actor_role  VARCHAR(10)  CHECK (actor_role IN ('ADMIN', 'STUDENT')), -- null: not logged in (a failed login, say)
    actor_id    BIGINT,
    actor_name  VARCHAR(201),
    actor_email VARCHAR(255),
    action      VARCHAR(120) NOT NULL,   -- "Assigned a task"
    target      VARCHAR(255),            -- what it was done to: "Printer offline"
    http_method VARCHAR(10)  NOT NULL,
    path        VARCHAR(255) NOT NULL,
    status      INT          NOT NULL,   -- the HTTP status: 2xx worked, anything else didn't
    reason      VARCHAR(500),            -- why it didn't work, as the person was told
    ip_address  VARCHAR(45)
);

CREATE INDEX idx_activity_log_occurred ON activity_log (occurred_at DESC);
CREATE INDEX idx_activity_log_actor ON activity_log (actor_role, actor_id, occurred_at DESC);

-- Where the separate app role exists (docs/db-roles.sql), it may add and read entries but never
-- change or delete them, so the log can't be quietly rewritten through the app.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'isandt_app') THEN
        REVOKE UPDATE, DELETE ON activity_log FROM isandt_app;
    END IF;
END
$$;
