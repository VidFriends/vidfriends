// Explicit, forward-only migrate step (NFR-REL-03). Runs as a one-shot before server and worker start.
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Database } from '../infra/db.js';

export function migrationsFolder(): string {
  // src/db → ../../drizzle and dist/db → ../../drizzle both resolve to apps/server/drizzle.
  const dir = fileURLToPath(new URL('../../drizzle', import.meta.url));
  if (!existsSync(dir)) throw new Error(`migrations folder not found: ${dir}`);
  return dir;
}

export async function runMigrations(database: Database): Promise<void> {
  await migrate(database.db, { migrationsFolder: migrationsFolder() });
}
