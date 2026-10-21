-- Admins and students now live in separate tables: "admins" (new) and "students" (the old "users").
-- Every step keeps the existing data; read top to bottom.

-- 1. The admins table. created_by_id is the admin who added this admin.
CREATE TABLE admins (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE,
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    status          VARCHAR(20)  NOT NULL CHECK (status IN ('ACTIVE', 'DISABLED')),
    password_hash   VARCHAR(255),
    receives_digest BOOLEAN      NOT NULL DEFAULT FALSE,
    created_by_id   BIGINT REFERENCES admins (id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ  NOT NULL
);

-- 2. Copy the existing admins across (they get new id numbers in their new table).
INSERT INTO admins (email, first_name, last_name, status, password_hash, receives_digest, created_at)
SELECT email, first_name, last_name, status, password_hash, receives_digest, created_at
FROM users
WHERE role = 'ADMIN';

-- 3. The rest of "users" becomes "students".
ALTER TABLE users RENAME TO students;

-- 4. "Added by" must now point at the admins table, not at a row in the same table.
--    Old admin rows are matched to their copies in admins by email.
ALTER TABLE students ADD COLUMN added_by_admin_id BIGINT REFERENCES admins (id) ON DELETE SET NULL;
UPDATE students s
SET added_by_admin_id = a.id
FROM students creator
JOIN admins a ON a.email = creator.email
WHERE s.created_by_id = creator.id;
ALTER TABLE students DROP COLUMN created_by_id;
ALTER TABLE students RENAME COLUMN added_by_admin_id TO created_by_id;

-- 5. A password link belongs to either a student or an admin: exactly one of the two columns is set.
ALTER TABLE password_tokens RENAME COLUMN user_id TO student_id;
ALTER TABLE password_tokens ALTER COLUMN student_id DROP NOT NULL;
ALTER TABLE password_tokens ADD COLUMN admin_id BIGINT REFERENCES admins (id) ON DELETE CASCADE;
ALTER TABLE password_tokens ADD CONSTRAINT password_tokens_one_owner
    CHECK ((student_id IS NULL) <> (admin_id IS NULL));
CREATE INDEX idx_password_tokens_admin_id ON password_tokens (admin_id);

-- 6. Remove the admins from students (their old password links go too, by ON DELETE CASCADE),
--    then the columns only admins needed.
DELETE FROM students WHERE role = 'ADMIN';
ALTER TABLE students DROP COLUMN role;
ALTER TABLE students DROP COLUMN receives_digest;

-- 7. Student ID becomes required and unique. Existing test rows without one get a visible
--    placeholder; repeated IDs get a suffix so the unique rule can be added.
UPDATE students SET student_id = 'MISSING-' || id WHERE student_id IS NULL OR student_id = '';
UPDATE students s
SET student_id = s.student_id || '-DUPLICATE-' || s.id
WHERE EXISTS (SELECT 1 FROM students other WHERE other.student_id = s.student_id AND other.id < s.id);
ALTER TABLE students ALTER COLUMN student_id SET NOT NULL;
ALTER TABLE students ADD CONSTRAINT students_student_id_key UNIQUE (student_id);
