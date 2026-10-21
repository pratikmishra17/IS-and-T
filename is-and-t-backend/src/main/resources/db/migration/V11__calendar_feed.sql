-- Each student's private calendar link: /api/calendar/<token>.ics. Calendar apps fetch it without
-- logging in, so the random token is what keeps it private. Null until the student asks for one.
ALTER TABLE students ADD COLUMN calendar_token VARCHAR(64) UNIQUE;
