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
