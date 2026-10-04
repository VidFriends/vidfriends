import pg from 'pg';
import { randomBytes } from 'node:crypto';

export const TEMPLATE_DB = 'vf_test_template';

export function adminUrl(): string {
  return process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';
}

export function withDatabase(name: string): string {
  const url = new URL(adminUrl());
  url.pathname = `/${name}`;
  return url.toString();
}

/** Clones the migrated template into a fresh database for one test file. */
export async function createTestDatabase(): Promise<{ url: string; drop(): Promise<void> }> {
  const name = `vf_test_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: adminUrl() });
  await admin.connect();
  await admin.query(`create database ${name} template ${TEMPLATE_DB}`);
  await admin.end();
  return {
    url: withDatabase(name),
    async drop() {
      const c = new pg.Client({ connectionString: adminUrl() });
      await c.connect();
      await c.query(`drop database if exists ${name} with (force)`);
      await c.end();
    },
  };
}
