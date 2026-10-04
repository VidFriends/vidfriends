// Append-only audit log writes (FR-ADM-05, WF-ADM-6). Never record passwords, tokens or content.
import { auditLog } from '../../db/schema.js';
import type { DbOrTx } from '../../infra/db.js';
import { isIP } from 'node:net';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

export async function audit(db: DbOrTx, entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    metadata: entry.metadata ?? {},
    ip: entry.ip && isIP(entry.ip) ? entry.ip : null,
  });
}
