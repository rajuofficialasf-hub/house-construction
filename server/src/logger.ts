import { pino, type DestinationStream, type Level, type Logger } from 'pino';

// Never log credentials, session material or request bodies (NE-LOG-02).
const REDACT = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.password_hash',
  '*.token',
  // No body is logged today; this keeps private values (phone, NID) out if that ever changes.
  'req.body',
  'res.body',
];

/** A JSON logger with secrets redacted, writing to stdout unless given another destination. */
export function createLogger(level: Level | 'silent', destination?: DestinationStream): Logger {
  return pino({ level, redact: { paths: REDACT, censor: '[redacted]' } }, destination);
}
