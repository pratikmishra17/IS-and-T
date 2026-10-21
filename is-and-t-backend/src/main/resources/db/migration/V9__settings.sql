-- Settings admins can change in the admin portal, as key/value pairs.

CREATE TABLE app_settings (
    setting_key   VARCHAR(50)  PRIMARY KEY,
    setting_value VARCHAR(255) NOT NULL
);

INSERT INTO app_settings (setting_key, setting_value) VALUES
    ('digest_time', '08:00'),              -- when the daily digest goes out, campus time, weekdays
    ('default_task_duration', '30'),       -- minutes, pre-filled on new tasks
    ('digest_last_sent', '2000-01-01');    -- so the digest goes out once a day, even across restarts
