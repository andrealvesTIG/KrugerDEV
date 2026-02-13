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

    `CREATE TABLE IF NOT EXISTS custom_portfolio_projects (
      id SERIAL PRIMARY KEY,
      portfolio_id INTEGER NOT NULL REFERENCES portfolios(id),
      project_id INTEGER NOT NULL REFERENCES projects(id),
      added_at TIMESTAMP DEFAULT NOW(),
      added_by VARCHAR REFERENCES users(id)
    )`,

    `CREATE UNIQUE INDEX IF NOT EXISTS custom_portfolio_projects_unique 
     ON custom_portfolio_projects (portfolio_id, project_id)`,

    `CREATE TABLE IF NOT EXISTS portfolio_risk_assessments (
      id SERIAL PRIMARY KEY,
      portfolio_id INTEGER NOT NULL REFERENCES portfolios(id),
      organization_id INTEGER NOT NULL REFERENCES organizations(id),
      risk_score INTEGER NOT NULL,
      summary TEXT NOT NULL,
      report_json TEXT NOT NULL,
      share_token TEXT NOT NULL,
      generated_by VARCHAR REFERENCES users(id),
      generated_at TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS project_risk_assessments (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      organization_id INTEGER NOT NULL REFERENCES organizations(id),
      risk_score INTEGER NOT NULL,
      summary TEXT NOT NULL,
      report_json TEXT NOT NULL,
      share_token TEXT NOT NULL,
      generated_by VARCHAR REFERENCES users(id),
      generated_at TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW()
    )`,
  ];

  for (const sql of migrations) {
    try {
      await client.query(sql);
      const label = sql.replace(/\s+/g, ' ').trim().substring(0, 80);
      console.log(`  OK: ${label}...`);
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
