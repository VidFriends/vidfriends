// Instance settings (FRD WF-ADM-3): stored as key/value rows, validated by the contract schema,
// read at request time so changes never need a restart (BR-GEN-5).
import { InstanceSettings } from '@vidfriends/contracts';
import { sql } from 'drizzle-orm';
import { instanceSettings } from '../../db/schema.js';
import type { DbOrTx } from '../../infra/db.js';

export async function getSettings(db: DbOrTx): Promise<InstanceSettings> {
  const rows = await db.select().from(instanceSettings);
  const raw: Record<string, unknown> = {};
  for (const row of rows) raw[row.key] = row.value;
  const parsed = InstanceSettings.safeParse(raw);
  // A stored value that no longer validates falls back to defaults instead of breaking requests.
  if (parsed.success) return parsed.data;
  const fallback: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const shape = InstanceSettings.shape[key as keyof InstanceSettings];
    if (shape && shape.safeParse(value).success) fallback[key] = value;
  }
  return InstanceSettings.parse(fallback);
}

export async function updateSettings(
  db: DbOrTx,
  patch: Partial<InstanceSettings>,
  actorId: string | null,
): Promise<void> {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    await db
      .insert(instanceSettings)
      .values({ key, value: value as object, updatedBy: actorId })
      .onConflictDoUpdate({
        target: instanceSettings.key,
        set: { value: sql`excluded.value`, updatedBy: actorId, updatedAt: sql`now()` },
      });
  }
}
