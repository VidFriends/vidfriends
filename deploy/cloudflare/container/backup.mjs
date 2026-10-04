// Backups for the Cloudflare test instance (ADR-0021): Postgres as a dump and SeaweedFS's files,
// uploaded through the fronting Worker to a private R2 bucket. Files are split into 64 MB parts
// and only changed files are sent again; full SeaweedFS volumes (capped at 64 MB) never change.
// Usage: node backup.mjs backup | restore
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA = process.env.DATA_DIR ?? '/data';
const SEAWEED = path.join(DATA, 'seaweed');
const STATE = path.join(DATA, 'backup-state.json');
const DUMP = path.join(DATA, 'db.dump');
const BASE = process.env.BACKUP_URL; // e.g. https://vidfriends.app/__backup
const TOKEN = process.env.BACKUP_TOKEN;
const PART = 64 * 1024 * 1024;

if (!BASE || !TOKEN) {
  console.error('backup: BACKUP_URL and BACKUP_TOKEN are required');
  process.exit(2);
}
const auth = { authorization: `Bearer ${TOKEN}` };
const log = (...a) => console.log(new Date().toISOString(), 'backup:', ...a);

async function put(key, body) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${BASE}/${key}`, { method: 'PUT', headers: auth, body });
    if (res.ok) return;
    if (attempt >= 4) throw new Error(`PUT ${key} -> ${res.status} ${await res.text()}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

async function get(key) {
  const res = await fetch(`${BASE}/${key}`, { headers: auth });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${key} -> ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}

const stamp = (st) => `${st.size}:${Math.floor(st.mtimeMs)}`;
const keyFor = (rel, i) =>
  `files/${createHash('sha256').update(rel).digest('hex').slice(0, 32)}.${i}`;

async function uploadFile(abs, rel) {
  const size = fs.statSync(abs).size;
  const parts = Math.max(1, Math.ceil(size / PART));
  const fd = fs.openSync(abs, 'r');
  try {
    for (let i = 0; i < parts; i++) {
      const len = Math.min(PART, size - i * PART);
      const buf = Buffer.alloc(Math.max(0, len));
      if (len > 0) fs.readSync(fd, buf, 0, len, i * PART);
      await put(keyFor(rel, i), buf);
    }
  } finally {
    fs.closeSync(fd);
  }
  return parts;
}

async function backup() {
  const started = Date.now();
  const dump = spawnSync(
    'pg_dump',
    ['-Fc', '-h', '127.0.0.1', '-U', 'vidfriends', '-d', 'vidfriends', '-f', DUMP],
    { env: { ...process.env, PGPASSWORD: process.env.POSTGRES_PASSWORD }, stdio: 'inherit' },
  );
  if (dump.status !== 0) throw new Error('pg_dump failed');
  const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
  const files = {};
  let sent = 0;
  for (const abs of walk(SEAWEED)) {
    const rel = path.relative(SEAWEED, abs);
    const st = fs.statSync(abs);
    const s = stamp(st);
    if (state[rel]?.stamp === s) {
      files[rel] = state[rel];
      continue;
    }
    files[rel] = { stamp: s, parts: await uploadFile(abs, rel), mtime: st.mtimeMs };
    sent++;
  }
  const dbParts = await uploadFile(DUMP, '__db.dump');
  await put(
    'manifest.json',
    JSON.stringify({ created_at: new Date().toISOString(), db_parts: dbParts, files }),
  );
  fs.writeFileSync(STATE, JSON.stringify(files));
  log(`done: ${sent} changed file(s) of ${Object.keys(files).length}, ${Date.now() - started} ms`);
}

async function download(rel, parts, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const fd = fs.openSync(dest, 'w');
  try {
    for (let i = 0; i < parts; i++) {
      const buf = await get(keyFor(rel, i));
      if (!buf) throw new Error(`missing part ${i} of ${rel}`);
      fs.writeSync(fd, buf);
    }
  } finally {
    fs.closeSync(fd);
  }
}

/** Restores files and the dump; exits 0 when restored, 3 when there is no backup yet. */
async function restore() {
  const raw = await get('manifest.json');
  if (!raw) {
    log('no backup yet; starting empty');
    process.exit(3);
  }
  const manifest = JSON.parse(raw.toString('utf8'));
  for (const [rel, f] of Object.entries(manifest.files)) {
    const dest = path.join(SEAWEED, rel);
    await download(rel, f.parts, dest);
    fs.utimesSync(dest, new Date(f.mtime), new Date(f.mtime));
  }
  await download('__db.dump', manifest.db_parts, DUMP);
  // Files now match the manifest exactly, so the next backup only sends changes.
  const restored = {};
  for (const [rel, f] of Object.entries(manifest.files)) {
    restored[rel] = { ...f, stamp: stamp(fs.statSync(path.join(SEAWEED, rel))) };
  }
  fs.writeFileSync(STATE, JSON.stringify(restored));
  log(`restored backup from ${manifest.created_at} (${Object.keys(manifest.files).length} files)`);
}

const mode = process.argv[2];
try {
  if (mode === 'backup') await backup();
  else if (mode === 'restore') await restore();
  else {
    console.error('usage: node backup.mjs backup | restore');
    process.exit(2);
  }
} catch (err) {
  console.error(new Date().toISOString(), 'backup: failed:', err.message);
  process.exit(1);
}
