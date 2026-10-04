#!/usr/bin/env node
// Migration immutability check (NFR-REL-03, L-14).
//   node scripts/check-migrations.mjs            verify every migration matches apps/server/drizzle/CHECKSUMS
//   node scripts/check-migrations.mjs --update   append checksums for NEW migrations (never rewrites existing lines)
//   node scripts/check-migrations.mjs --base origin/main
//                                                also fail if any checksum line on the base ref was changed or removed
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'apps/server/drizzle');
const sumsFile = join(dir, 'CHECKSUMS');
const args = process.argv.slice(2);

const parse = (text) =>
  new Map(
    text
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith('#'))
      .map((l) => {
        const [hash, name] = l.trim().split(/\s+/);
        return [name, hash];
      }),
  );

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();
const sha = (f) =>
  createHash('sha256')
    .update(readFileSync(join(dir, f)))
    .digest('hex');
const recorded = existsSync(sumsFile) ? parse(readFileSync(sumsFile, 'utf8')) : new Map();
const problems = [];

if (args.includes('--update')) {
  const lines = existsSync(sumsFile)
    ? readFileSync(sumsFile, 'utf8').trimEnd().split('\n')
    : [
        '# sha256 of each applied migration. Never edit a line: migrations are immutable once merged.',
      ];
  for (const f of files) if (!recorded.has(f)) lines.push(`${sha(f)}  ${f}`);
  writeFileSync(sumsFile, lines.join('\n') + '\n');
}

const sums = existsSync(sumsFile) ? parse(readFileSync(sumsFile, 'utf8')) : new Map();
for (const f of files) {
  if (!sums.has(f))
    problems.push(
      `${f} has no checksum. Run \`pnpm --filter @vidfriends/server db:generate\` or this script with --update.`,
    );
  else if (sums.get(f) !== sha(f))
    problems.push(
      `${f} was modified after its checksum was recorded. Migrations are immutable: add a new migration instead.`,
    );
}
for (const name of sums.keys())
  if (!files.includes(name))
    problems.push(`${name} is recorded but missing. Never delete a migration.`);

const baseIdx = args.indexOf('--base');
if (baseIdx !== -1) {
  const ref = args[baseIdx + 1];
  let baseText = '';
  try {
    baseText = execFileSync('git', ['show', `${ref}:apps/server/drizzle/CHECKSUMS`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    baseText = '';
  }
  for (const [name, hash] of parse(baseText)) {
    if (sums.get(name) !== hash)
      problems.push(`${name}: checksum differs from ${ref}. Merged migrations must never change.`);
  }
}

if (problems.length) {
  console.error(problems.map((p) => `migration check: ${p}`).join('\n'));
  process.exit(1);
}
console.log(`migration check: ${files.length} migration(s) verified`);
