import pino from 'pino'

// ──────────────────────────────────────────────────────────────────────────
// Structured logging. In production this emits one JSON line per event —
// exactly what Railway (or any log aggregator) indexes and searches. In
// dev it pretty-prints. Levels: request logs at info, handled 4xx at warn,
// unexpected 5xx and client-reported crashes at error (with stacks).
// LOG_LEVEL overrides (e.g. LOG_LEVEL=debug); tests stay quiet.
// ──────────────────────────────────────────────────────────────────────────

const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const IS_TEST = process.env.NODE_ENV === 'test'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (IS_TEST ? 'silent' : 'info'),
  // Redact anything that could carry credentials into the logs.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.newPassword',
      '*.accessToken',
      '*.refreshToken',
    ],
    censor: '[redacted]',
  },
  ...(IS_PRODUCTION || IS_TEST
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }),
})
