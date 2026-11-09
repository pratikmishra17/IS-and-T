-- What opens after someone logs in: their portal's home page (the default), or the page they were
-- on last. Each person picks it on their Account page.
ALTER TABLE admins ADD COLUMN after_login VARCHAR(20) NOT NULL DEFAULT 'HOME' CHECK (after_login IN ('HOME', 'LAST_PAGE'));
ALTER TABLE students ADD COLUMN after_login VARCHAR(20) NOT NULL DEFAULT 'HOME' CHECK (after_login IN ('HOME', 'LAST_PAGE'));
