-- Self-registration is removed: every account is now added by a manager.

-- Registrations that were never approved have no place in the new flow (only test data existed).
-- Their password tokens are removed by ON DELETE CASCADE.
DELETE FROM users WHERE status IN ('PENDING', 'REJECTED');

-- Only two statuses remain. PostgreSQL named the original CHECK constraint users_status_check.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('ACTIVE', 'DISABLED'));

-- "Approved by" no longer exists; what matters is which manager added the account.
-- The time it was added is already in created_at.
ALTER TABLE users RENAME COLUMN approved_by_id TO created_by_id;
ALTER TABLE users DROP COLUMN approved_at;
