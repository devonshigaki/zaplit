/**
 * Structured logging with Pino
 */
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  base: {
    pid: process.pid,
    env: process.env.DEPLOYMENT_ENV || 'unknown',
  },
});

export function createCheckLogger(checkName: string) {
  return logger.child({ check: checkName });
}
