#!/usr/bin/env node
/* eslint-disable no-console -- CLI report */
// NFR-PERF-04: the initial JS (entry + modulepreloads in index.html) must stay ≤ 250 kB gzip.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const LIMIT = 250 * 1024;
const dist = join(import.meta.dirname, '..', 'dist');
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const files = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
let total = 0;
for (const f of new Set(files)) {
  const size = gzipSync(readFileSync(join(dist, f))).length;
  total += size;
  console.log(`${(size / 1024).toFixed(1).padStart(7)} kB  ${f}`);
}
console.log(
  `${(total / 1024).toFixed(1).padStart(7)} kB  total initial JS (gzip), limit ${LIMIT / 1024} kB`,
);
if (total > LIMIT) {
  console.error('Initial JS bundle exceeds the NFR-PERF-04 budget.');
  process.exit(1);
}
