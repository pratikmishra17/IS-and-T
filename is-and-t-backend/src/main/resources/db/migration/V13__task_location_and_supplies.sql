-- Tasks: one free-text location instead of building + room, the employee's details all optional
-- (no department), and a typed list of things to bring.

ALTER TABLE tasks ADD COLUMN location VARCHAR(200);
UPDATE tasks SET location = trim(building || ' ' || room);
ALTER TABLE tasks ALTER COLUMN location SET NOT NULL;
ALTER TABLE tasks DROP COLUMN building;
ALTER TABLE tasks DROP COLUMN room;

ALTER TABLE tasks ALTER COLUMN employee_name DROP NOT NULL;
ALTER TABLE tasks DROP COLUMN employee_department;

-- What the student should bring, typed by the admin ("Dual Monitors (Both C-type)", 2). Unlike
-- task_items, these aren't tied to the inventory: nothing is reserved or deducted.
CREATE TABLE task_supplies (
    task_id  BIGINT       NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    position INTEGER      NOT NULL,
    name     VARCHAR(100) NOT NULL,
    quantity INTEGER      NOT NULL CHECK (quantity BETWEEN 1 AND 99),
    PRIMARY KEY (task_id, position)
);
