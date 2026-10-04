// Creates a migrated template database once; each test file clones it (fast, isolated).
import pg from 'pg';
import { createDatabase } from '../../src/infra/db.js';
import { runMigrations } from '../../src/db/migrate.js';
import { adminUrl, TEMPLATE_DB, withDatabase } from './db.js';

export default async function setup(): Promise<() => Promise<void>> {
  const admin = new pg.Client({ connectionString: adminUrl() });
  await admin.connect();
  await admin.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname = $1`, [
    TEMPLATE_DB,
  ]);
  await admin.query(`drop database if exists ${TEMPLATE_DB}`);
  await admin.query(`create database ${TEMPLATE_DB}`);
  const database = createDatabase(withDatabase(TEMPLATE_DB), 1);
  await runMigrations(database);
  await database.close();
  await admin.end();
  return async () => {};
}
