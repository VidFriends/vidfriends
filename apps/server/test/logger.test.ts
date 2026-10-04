// NFR-PRIV-02: logs never contain passwords, tokens, invite codes, push endpoints, notes or replies.
import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../src/infra/logger.js';

function capture() {
  const lines: string[] = [];
  const log = createLogger(
    'info',
    new Writable({ write: (c, _e, cb) => (lines.push(String(c)), cb()) }),
  );
  return { log, lines };
}

describe('log redaction', () => {
  it('redacts secrets and content at the top level and one level deep', () => {
    const { log, lines } = capture();
    log.info(
      {
        req: {
          headers: { cookie: 'vf_session=abc', authorization: 'Bearer xyz', 'x-csrf-token': 'c' },
        },
        password: 'hunter2hunter2',
        body: {
          password: 'p',
          new_password: 'n',
          current_password: 'c',
          token: 't',
          setup_token: 's',
          invite_code: 'i',
          code: 'k',
          note: 'my note',
          body: 'reply text',
          endpoint: 'https://push',
          p256dh: 'key',
          auth: 'a',
        },
        user_id: '0190',
      },
      'event',
    );
    const out = lines.join('');
    for (const secret of [
      'abc',
      'Bearer xyz',
      'hunter2hunter2',
      'my note',
      'reply text',
      'https://push',
    ]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain('[redacted]');
    expect(out).toContain('"user_id":"0190"');
  });
});
