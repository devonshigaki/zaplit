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

/**
 * Logger class wrapper for compatibility
 * @deprecated Use the logger instance directly or createCheckLogger()
 */
export class Logger {
  private checkName: string;
  
  constructor(checkName: string) {
    this.checkName = checkName;
  }
  
  info(msg: string, meta?: Record<string, unknown>) {
    logger.info({ check: this.checkName, ...meta }, msg);
  }
  
  error(msg: string, error?: Error, meta?: Record<string, unknown>) {
    logger.error({ check: this.checkName, error: error?.message, stack: error?.stack, ...meta }, msg);
  }
  
  warn(msg: string, meta?: Record<string, unknown>) {
    logger.warn({ check: this.checkName, ...meta }, msg);
  }
  
  debug(msg: string, meta?: Record<string, unknown>) {
    logger.debug({ check: this.checkName, ...meta }, msg);
  }
}

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
