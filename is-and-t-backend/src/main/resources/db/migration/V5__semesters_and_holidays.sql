-- Semesters set each student's weekly hour limit; holidays get a warning when shifts or tasks fall on them.

CREATE TABLE semesters (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name              VARCHAR(100) NOT NULL UNIQUE,
    type              VARCHAR(20)  NOT NULL CHECK (type IN ('FALL', 'SPRING', 'SUMMER')),
    start_date        DATE         NOT NULL,
    end_date          DATE         NOT NULL,
    weekly_hour_limit INTEGER      NOT NULL CHECK (weekly_hour_limit BETWEEN 1 AND 80),
    CHECK (end_date >= start_date)
);

-- One row per day: a week-long break is seven rows with the same name.
CREATE TABLE holidays (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    holiday_date DATE         NOT NULL UNIQUE,
    name         VARCHAR(200) NOT NULL,
    source       VARCHAR(20)  NOT NULL CHECK (source IN ('MANUAL', 'ICS_IMPORT'))
);
