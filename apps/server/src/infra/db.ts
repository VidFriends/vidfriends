import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../db/schema.js';

export type Db = NodePgDatabase<typeof schema>;
/** A database handle or a transaction on it. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

export interface Database {
  pool: pg.Pool;
  db: Db;
  close(): Promise<void>;
}

export function createDatabase(url: string, max = 10): Database {
  const pool = new pg.Pool({ connectionString: url, max });
  // A broken idle client must not crash the process; the next checkout reconnects.
  pool.on('error', () => {});
  const db = drizzle(pool, { schema });
  return { pool, db, close: () => pool.end() };
}
