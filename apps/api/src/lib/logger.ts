import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
      'token',
      '*.token',
      'password',
      '*.password',
      'secret',
      '*.secret',
      'clientSecret',
      'codeVerifier',
    ],
    censor: '[redacted]',
  },
  transport:
    env.NODE_ENV === 'development' && env.LOG_LEVEL !== 'silent'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
});
