-- "user" is a reserved word in PostgreSQL, so the table is "users".
CREATE TABLE users (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE,
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    student_id      VARCHAR(50),
    role            VARCHAR(20)  NOT NULL CHECK (role IN ('STUDENT', 'MANAGER')),
    status          VARCHAR(20)  NOT NULL CHECK (status IN ('PENDING', 'ACTIVE', 'REJECTED', 'DISABLED')),
    password_hash   VARCHAR(255),
    receives_digest BOOLEAN      NOT NULL DEFAULT FALSE,
    approved_by_id  BIGINT REFERENCES users (id),
    approved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL
);

-- Single-use links for setting or resetting a password. Only a hash of the token is stored.
CREATE TABLE password_tokens (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    purpose    VARCHAR(20) NOT NULL CHECK (purpose IN ('SET_PASSWORD', 'RESET_PASSWORD')),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_password_tokens_user_id ON password_tokens (user_id);
