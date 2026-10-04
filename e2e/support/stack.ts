import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..');

function compose(args: string[]): string {
  return execFileSync(
    'docker',
    [
      'compose',
      '-p',
      'vf-e2e',
      '--env-file',
      join(root, 'e2e/.stack/e2e.env'),
      '-f',
      join(root, 'deploy/compose.yml'),
      '-f',
      join(root, 'e2e/compose.e2e.yml'),
      ...args,
    ],
    { cwd: root, encoding: 'utf8' },
  );
}

/** Reads the one-time setup token from the server log, as an operator would (J-1). */
export function setupTokenFromLogs(): string {
  const logs = compose(['logs', '--no-color', 'server']);
  const matches = [...logs.matchAll(/enter the setup token: ([A-Za-z0-9_-]{43})/g)];
  const last = matches.at(-1)?.[1];
  if (!last) throw new Error('setup token not found in server logs');
  return last;
}

/** Runs a read-only SQL query against the stack database (verification only). */
export function sql(query: string): string {
  return compose([
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'vidfriends',
    '-d',
    'vidfriends',
    '-At',
    '-c',
    query,
  ]).trim();
}
