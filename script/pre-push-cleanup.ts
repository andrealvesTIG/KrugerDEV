import pg from "pg";

async function cleanup() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn("No DATABASE_URL found, skipping pre-push cleanup");
    return;
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  const cleanups: string[] = [
    `UPDATE tasks SET parent_id = NULL WHERE parent_id IS NOT NULL AND parent_id NOT IN (SELECT id FROM tasks)`,
    `ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_parent_id_tasks_id_fk`,
    `DROP INDEX IF EXISTS tasks_project_external_id_unique_idx`,

    // Merge duplicate timesheet entries before applying te_resource_task_date_unique_idx.
    // For each (resource_id, task_id, entry_date) group: sum hours into the lowest-id row,
    // then delete the duplicates. Idempotent — no-op when no duplicates exist.
    `WITH dups AS (
      SELECT
        id,
        ROW_NUMBER() OVER (PARTITION BY resource_id, task_id, entry_date ORDER BY id) AS rn,
        SUM(hours::numeric) OVER (PARTITION BY resource_id, task_id, entry_date) AS summed_hours,
        COUNT(*) OVER (PARTITION BY resource_id, task_id, entry_date) AS group_count
      FROM timesheet_entries
    )
    UPDATE timesheet_entries te
    SET hours = d.summed_hours, updated_at = NOW()
    FROM dups d
    WHERE te.id = d.id AND d.rn = 1 AND d.group_count > 1`,

    `DELETE FROM timesheet_entries
     WHERE id IN (
       SELECT id FROM (
         SELECT id, ROW_NUMBER() OVER (
           PARTITION BY resource_id, task_id, entry_date ORDER BY id
         ) AS rn
         FROM timesheet_entries
       ) ranked
       WHERE rn > 1
     )`,
  ];

  for (const sql of cleanups) {
    try {
      const result = await client.query(sql);
      const label = sql.replace(/\s+/g, ' ').trim().substring(0, 80);
      console.log(`  OK (${result.rowCount} rows): ${label}...`);
    } catch (err: any) {
      console.warn(`  SKIP: ${err.message}`);
    }
  }

  await client.end();
  console.log("Pre-push cleanup complete.");
}

cleanup().catch((err) => {
  console.error("Pre-push cleanup failed:", err);
  process.exit(1);
});
