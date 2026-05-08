#!/usr/bin/env node
/**
 * ChaloPB Migration Runner
 * Usage:
 *   node migrate.js            - run all pending migrations
 *   node migrate.js --status   - show migration status
 *   node migrate.js --dry-run  - show pending migrations without executing
 */
import { readdir, readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "migrations");
const isDryRun = process.argv.includes("--dry-run");
const isStatus = process.argv.includes("--status");

if (!process.env.DATABASE_URL) {
  process.stderr.write("DATABASE_URL is required to run migrations.\n");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      filename   TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checksum   TEXT NOT NULL
    )
  `);
}

async function getAppliedMigrations(client) {
  const result = await client.query(
    "SELECT version, filename, applied_at, checksum FROM schema_migrations ORDER BY version"
  );
  return new Map(result.rows.map((row) => [row.version, row]));
}

async function getMigrationFiles() {
  const files = await readdir(MIGRATIONS_DIR);
  return files
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((filename) => ({
      filename,
      version: filename.replace(/\.sql$/i, ""),
      path: join(MIGRATIONS_DIR, filename),
    }));
}

async function checksumOf(content) {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function printStatus(files, applied) {
  process.stdout.write("\nMigration Status\n");
  process.stdout.write(`${"=".repeat(50)}\n`);

  for (const file of files) {
    const row = applied.get(file.version);
    const mark = row ? `applied ${new Date(row.applied_at).toISOString().slice(0, 10)}` : "pending";
    process.stdout.write(`  ${mark.padEnd(20)} ${file.filename}\n`);
  }

  const pending = files.filter((file) => !applied.has(file.version));
  process.stdout.write(`\n  ${applied.size} applied, ${pending.length} pending\n\n`);
}

async function run() {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);
    const files = await getMigrationFiles();

    if (isStatus) {
      printStatus(files, applied);
      return;
    }

    const pending = files.filter((file) => !applied.has(file.version));
    if (pending.length === 0) {
      process.stdout.write("All migrations are already applied.\n");
      return;
    }

    process.stdout.write(`\nRunning ${pending.length} pending migration(s)...\n\n`);

    for (const migration of pending) {
      const sql = await readFile(migration.path, "utf8");
      const checksum = await checksumOf(sql);

      if (isDryRun) {
        process.stdout.write(`  [DRY RUN] Would apply: ${migration.filename}\n`);
        continue;
      }

      const existing = applied.get(migration.version);
      if (existing && existing.checksum !== checksum) {
        throw new Error(
          `Checksum mismatch for already-applied migration ${migration.filename}. Do not edit historical migrations.`
        );
      }

      process.stdout.write(`  Applying: ${migration.filename}\n`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO schema_migrations (version, filename, checksum)
           VALUES ($1, $2, $3)`,
          [migration.version, migration.filename, checksum]
        );
        await client.query("COMMIT");
        process.stdout.write(`  Done: ${migration.filename}\n`);
      } catch (err) {
        await client.query("ROLLBACK");
        process.stderr.write(`  FAILED: ${migration.filename}\n`);
        process.stderr.write(`  ${err.message}\n`);
        process.exit(1);
      }
    }

    process.stdout.write("\nAll migrations applied successfully.\n\n");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  process.stderr.write(`Migration runner error: ${err.message}\n`);
  process.exit(1);
});
