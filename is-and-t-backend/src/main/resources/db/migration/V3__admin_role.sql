-- The role that runs the admin portal is now called ADMIN (it was MANAGER).
-- The CHECK constraint has to come off before the values change, then go back on with the new list.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
UPDATE users SET role = 'ADMIN' WHERE role = 'MANAGER';
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('STUDENT', 'ADMIN'));

-- Remove the placeholder admin that the dev seed used to create; the seed now creates the real one.
-- Accounts it added keep existing, they just no longer point at it.
UPDATE users SET created_by_id = NULL
WHERE created_by_id IN (SELECT id FROM users WHERE email = 'manager@isandt.local');
DELETE FROM users WHERE email = 'manager@isandt.local';
