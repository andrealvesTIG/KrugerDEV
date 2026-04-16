-- One-shot cleanup: merge duplicate timesheet entries before applying the unique index.
-- Strategy: for each (resource_id, task_id, entry_date) group with duplicates,
-- sum the hours into the lowest-id row and delete the others.
-- Safe to re-run: a no-op if no duplicates exist.

BEGIN;

WITH dups AS (
  SELECT
    id,
    resource_id,
    task_id,
    entry_date,
    hours,
    ROW_NUMBER() OVER (
      PARTITION BY resource_id, task_id, entry_date
      ORDER BY id
    ) AS rn,
    SUM(hours::numeric) OVER (
      PARTITION BY resource_id, task_id, entry_date
    ) AS summed_hours,
    COUNT(*) OVER (
      PARTITION BY resource_id, task_id, entry_date
    ) AS group_count
  FROM timesheet_entries
)
UPDATE timesheet_entries te
SET hours = d.summed_hours,
    updated_at = NOW()
FROM dups d
WHERE te.id = d.id
  AND d.rn = 1
  AND d.group_count > 1;

DELETE FROM timesheet_entries
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY resource_id, task_id, entry_date
        ORDER BY id
      ) AS rn
    FROM timesheet_entries
  ) ranked
  WHERE rn > 1
);

-- Verify no duplicates remain
SELECT resource_id, task_id, entry_date, COUNT(*) AS cnt
FROM timesheet_entries
GROUP BY resource_id, task_id, entry_date
HAVING COUNT(*) > 1;

COMMIT;
