#!/usr/bin/env node
// Brings the production compose stack up for E2E with throwaway secrets generated per run.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const stateDir = join(root, 'e2e', '.stack');
const envFile = join(stateDir, 'e2e.env');
const project = 'vf-e2e';
const port = process.env.E2E_HTTPS_PORT ?? '8443';
const compose = (...args) =>
  execFileSync(
    'docker',
    [
      'compose',
      '-p',
      project,
      '--env-file',
      envFile,
      '-f',
      join(root, 'deploy/compose.yml'),
      ...args,
    ],
    { stdio: 'inherit', cwd: root },
  );

const cmd = process.argv[2];
if (cmd === 'up') {
  mkdirSync(stateDir, { recursive: true });
  if (!existsSync(envFile)) {
    const hex = (n) => randomBytes(n).toString('hex');
    writeFileSync(
      envFile,
      [
        'DOMAIN=localhost',
        `PUBLIC_URL=https://localhost:${port}`,
        `HTTPS_PORT=${port}`,
        `HTTP_PORT=${process.env.E2E_HTTP_PORT ?? '8080'}`,
        `POSTGRES_PASSWORD=${hex(16)}`,
        `APP_SECRET=${hex(32)}`,
        `S3_ACCESS_KEY_ID=e2e${hex(6)}`,
        // Every E2E request comes from one IP; the per-IP auth limit is covered by API tests.
        'RATE_LIMIT_AUTH_PER_MINUTE=1000',
        `S3_SECRET_ACCESS_KEY=${hex(20)}`,
        `VIDFRIENDS_SERVER_IMAGE=${process.env.VIDFRIENDS_SERVER_IMAGE ?? 'vidfriends-server:local'}`,
        `VIDFRIENDS_WORKER_IMAGE=${process.env.VIDFRIENDS_WORKER_IMAGE ?? 'vidfriends-worker:local'}`,
        '',
      ].join('\n'),
    );
  }
  const build = process.argv.includes('--build') ? ['--build'] : [];
  compose('up', '-d', '--wait', '--wait-timeout', '180', ...build);
} else if (cmd === 'down') {
  compose('down', '-v', '--remove-orphans');
} else if (cmd === 'logs') {
  compose('logs', '--no-color', ...process.argv.slice(3));
} else {
  console.error('usage: stack.mjs up [--build] | down | logs [service]');
  process.exit(2);
}
