-- Sessions the server can end. Every login remembers its account's session_version; bumping the
-- number (account disabled, password changed) makes every existing session of that account invalid.
ALTER TABLE students ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admins   ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;

-- Forces a new password at the next login; until then the account can do nothing else.
ALTER TABLE students ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE admins   ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- The dev admin password was committed to git (application-dev.properties), so it is public:
-- every admin chooses a new password at their next login.
UPDATE admins SET must_change_password = TRUE WHERE password_hash IS NOT NULL;
