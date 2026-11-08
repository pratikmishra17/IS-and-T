-- Stock history used to note a deployment's stock as "Task #13". New rows say which task by name
-- ("Used for “Desk setup for Dr. Patel”"); rewrite the old ones the same way so the history reads
-- alike all the way back. The task id itself stays in task_id.
UPDATE inventory_transactions t
SET note = 'Used for “' || k.title || '”'
FROM tasks k
WHERE t.task_id = k.id
  AND t.note = 'Task #' || k.id;
