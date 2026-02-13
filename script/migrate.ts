import pg from "pg";

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn("No DATABASE_URL found, skipping migration");
    return;
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  const migrations: string[] = [
    `ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS is_custom boolean DEFAULT false`,
    `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS risk_assessment_config jsonb`,
  ];

  for (const sql of migrations) {
    try {
      await client.query(sql);
      console.log(`  OK: ${sql.substring(0, 80)}...`);
    } catch (err: any) {
      console.warn(`  SKIP: ${err.message}`);
    }
  }

  await client.end();
  console.log("Database migration complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
