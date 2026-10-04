// NFR-SEC-03, NFR-OPS-02: config validation and secret checks.
import { describe, expect, it } from 'vitest';
import { ConfigError, loadEnv } from '../src/config/env.js';

const good = {
  NODE_ENV: 'production',
  PUBLIC_URL: 'https://vf.example.org/',
  DATABASE_URL: 'postgres://vidfriends:Zq8vN3pLr2Xw9tKa@postgres:5432/vidfriends',
  APP_SECRET: 'p1VY0uGq0yXyB7m9zv0dN4jW2s8eK5rT3aQ6cH1fL7',
  S3_ACCESS_KEY_ID: 'vidfriends',
  S3_SECRET_ACCESS_KEY: 'Hk2nQ9wE4rT7yU1iO5pA8sD3',
};

function problems(env: Record<string, string>): string[] {
  try {
    loadEnv(env);
    return [];
  } catch (err) {
    expect(err).toBeInstanceOf(ConfigError);
    return (err as ConfigError).problems;
  }
}

describe('loadEnv', () => {
  it('accepts a strong production configuration and applies typed defaults', () => {
    const env = loadEnv(good);
    expect(env.PUBLIC_URL).toBe('https://vf.example.org');
    expect(env.PORT).toBe(8080);
    expect(env.SHUTDOWN_GRACE_SECONDS).toBe(15);
    expect(env.TRUSTED_PROXIES).toContain('172.16.0.0/12');
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
  });

  it('aggregates every missing required key into one error', () => {
    const p = problems({ NODE_ENV: 'production' });
    expect(p.join('\n')).toMatch(/PUBLIC_URL/);
    expect(p.join('\n')).toMatch(/DATABASE_URL/);
    expect(p.join('\n')).toMatch(/APP_SECRET/);
  });

  it.each([
    ['short', 'abc123'],
    ['known default', 'changeme'],
    ['placeholder', '<generate-me-with-openssl-rand-base64-48-xxxxxx>'],
    ['repeated', 'a'.repeat(40)],
  ])('refuses a %s APP_SECRET in production', (_label, value) => {
    expect(problems({ ...good, APP_SECRET: value }).join()).toMatch(/APP_SECRET/);
  });

  it.each([
    ['plain http', 'http://vf.example.org', /must use https/],
    ['an IP address', 'https://192.168.1.20', /domain name/],
    ['a bare host name', 'https://vidfriends', /domain name/],
  ])('refuses %s as PUBLIC_URL in production (ADR-0018)', (_label, url, message) => {
    expect(problems({ ...good, PUBLIC_URL: url }).join('\n')).toMatch(message);
  });

  it('allows localhost over http for trials', () => {
    expect(problems({ ...good, PUBLIC_URL: 'http://localhost:8080' })).toEqual([]);
  });

  it('refuses default database and storage passwords in production (L-06)', () => {
    expect(
      problems({ ...good, DATABASE_URL: 'postgres://postgres:postgres@db:5432/x' }).join(),
    ).toMatch(/DATABASE_URL password/);
    expect(problems({ ...good, DATABASE_URL: 'postgres://u@db/x' }).join()).toMatch(
      /must include a password/,
    );
    expect(problems({ ...good, S3_SECRET_ACCESS_KEY: 'minioadmin' }).join()).toMatch(
      /S3_SECRET_ACCESS_KEY/,
    );
    expect(problems({ ...good, S3_ACCESS_KEY_ID: '' }).join()).toMatch(/S3_ACCESS_KEY_ID/);
  });

  it('rejects malformed values with clear messages', () => {
    expect(problems({ ...good, PORT: 'eighty' }).join()).toMatch(/PORT/);
    expect(problems({ ...good, PUBLIC_URL: 'not a url' }).join()).toMatch(/PUBLIC_URL/);
    expect(problems({ ...good, ROLE: 'everything' }).join()).toMatch(/ROLE/);
  });

  it('allows relaxed secrets outside production but still requires a minimum', () => {
    expect(problems({ ...good, NODE_ENV: 'development', APP_SECRET: 'dev-secret-123456' })).toEqual(
      [],
    );
    expect(problems({ ...good, NODE_ENV: 'development', APP_SECRET: 'short' }).join()).toMatch(
      /APP_SECRET/,
    );
  });
});
