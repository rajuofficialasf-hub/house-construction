import { pino, type DestinationStream, type Level, type Logger } from 'pino';

// Never log credentials or session material (NE-LOG-02).
const REDACT = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.password_hash',
  '*.token',
];

/** A JSON logger with secrets redacted, writing to stdout unless given another destination. */
export function createLogger(level: Level | 'silent', destination?: DestinationStream): Logger {
  return pino({ level, redact: { paths: REDACT, censor: '[redacted]' } }, destination);
}
