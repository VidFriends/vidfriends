// Runs an external tool safely: execFile (no shell), argument array, wall-clock timeout with
// SIGKILL, and capped stdout/stderr (NFR-SEC-05, TDD §2).
import { spawn } from 'node:child_process';

export interface RunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export function run(
  file: string,
  args: string[],
  options: { timeoutMs: number; cwd?: string; maxOutputBytes?: number; env?: NodeJS.ProcessEnv },
): Promise<RunResult> {
  const cap = options.maxOutputBytes ?? 1024 * 1024;
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      detached: false,
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const take = (current: string, chunk: Buffer) =>
      current.length >= cap
        ? current
        : current + chunk.toString('utf8').slice(0, cap - current.length);
    child.stdout.on('data', (c: Buffer) => (stdout = take(stdout, c)));
    child.stderr.on('data', (c: Buffer) => (stderr = take(stderr, c)));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, options.timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, timedOut });
    });
  });
}
