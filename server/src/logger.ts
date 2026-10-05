import { pino, type Level, type Logger } from 'pino';

// Never log credentials or session material (NE-LOG-02).
const REDACT = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.password_hash',
  '*.token',
];

export function createLogger(level: Level | 'silent'): Logger {
  return pino({ level, redact: { paths: REDACT, censor: '[redacted]' } });
}
