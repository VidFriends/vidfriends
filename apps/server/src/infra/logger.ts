// Structured JSON logs with redaction (NFR-OPS-03, NFR-PRIV-02, LLD §5).
import pino, { type DestinationStream, type Logger } from 'pino';

export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  'password',
  'token',
  'code',
  'note',
  'body',
  'endpoint',
  '*.password',
  '*.current_password',
  '*.new_password',
  '*.token',
  '*.setup_token',
  '*.code',
  '*.invite_code',
  '*.note',
  '*.body',
  '*.endpoint',
  '*.p256dh',
  '*.auth',
];

export function createLogger(level: string, destination?: DestinationStream): Logger {
  return pino(
    {
      level,
      base: { service: 'vidfriends' },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
      formatters: { level: (label) => ({ level: label }) },
    },
    destination,
  );
}

export type { Logger };
