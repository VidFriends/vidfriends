// Generates deploy/ENV.md from the env schema (NFR-OPS-02). `--check` fails when it is stale.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { z } from 'zod';
import { ENV_SPEC } from '../src/config/env.js';

function defaultOf(schema: z.ZodType): string {
  const r = schema.safeParse(undefined);
  if (!r.success) return '**required**';
  if (r.data === undefined) return '(unset)';
  return '`' + (Array.isArray(r.data) ? r.data.join(',') : String(r.data)) + '`';
}

const rows = Object.entries(ENV_SPEC).map(([key, entry]) => {
  const e = entry as { schema: z.ZodType; description: string; secret?: boolean; example?: string };
  const notes = [
    e.description,
    e.example ? `Example: \`${e.example}\`.` : '',
    e.secret ? '**Secret.**' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return `| \`${key}\` | ${defaultOf(e.schema)} | ${notes.replace(/\|/g, '\\|')} |`;
});

const out = `# Environment reference

Generated from \`apps/server/src/config/env.ts\` by \`pnpm --filter @vidfriends/server env:docs\`. Do not edit by hand.

The server validates every value at startup and exits with one aggregated error message when something is wrong (NFR-OPS-02). With \`NODE_ENV=production\` it also refuses missing, short or known-default secrets (NFR-SEC-03).

Product policy (signup mode, quotas, retention, session lifetimes and so on) is **not** configured here: admins change it at runtime in the instance settings (FRD WF-ADM-3).

| Variable | Default | Description |
|---|---|---|
${rows.join('\n')}
`;

const file = fileURLToPath(new URL('../../../deploy/ENV.md', import.meta.url));
if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(file, 'utf8');
  } catch {
    // missing means stale
  }
  if (current !== out) {
    console.error(
      'deploy/ENV.md is stale. Run `pnpm --filter @vidfriends/server env:docs` and commit.',
    );
    process.exit(1);
  }
} else {
  writeFileSync(file, out);
}
