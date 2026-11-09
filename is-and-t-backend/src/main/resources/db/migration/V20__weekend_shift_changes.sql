-- A student can ask for different hours on one weekend day (an extra weekend shift). Weekly
-- ("every week") changes stay Monday to Friday; the app checks that, like weekly shifts.
ALTER TABLE shift_change_requests DROP CONSTRAINT shift_change_requests_day_of_week_check;
ALTER TABLE shift_change_requests ADD CONSTRAINT shift_change_requests_day_of_week_check
    CHECK (day_of_week IN ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'));
