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
 * Supports multiple constructor signatures:
 * - new Logger() - creates a default logger
 * - new Logger('checkName') - creates a logger with check name
 * - new Logger({ prefix: 'PREFIX' }) - creates a logger with prefix
 */
export class Logger {
  private checkName: string;
  private prefix?: string;

  constructor();
  constructor(checkName: string);
  constructor(options: { prefix?: string; check?: string });
  constructor(arg?: string | { prefix?: string; check?: string }) {
    if (typeof arg === 'string') {
      this.checkName = arg;
      this.prefix = arg;
    } else if (typeof arg === 'object' && arg !== null) {
      this.checkName = arg.check || 'default';
      this.prefix = arg.prefix;
    } else {
      this.checkName = 'default';
    }
  }

  private log(level: 'info' | 'error' | 'warn' | 'debug', msg: string, meta?: Record<string, unknown>) {
    const logData = { check: this.checkName, ...meta };
    if (this.prefix) {
      logger[level](logData, `[${this.prefix}] ${msg}`);
    } else {
      logger[level](logData, msg);
    }
  }

  info(msg: string, meta?: Record<string, unknown>) {
    this.log('info', msg, meta);
  }

  error(msg: string, error?: Error | string, meta?: Record<string, unknown>) {
    const errorData = error instanceof Error 
      ? { error: error.message, stack: error.stack }
      : { error };
    this.log('error', msg, { ...errorData, ...meta });
  }

  warn(msg: string, meta?: Record<string, unknown>) {
    this.log('warn', msg, meta);
  }

  debug(msg: string, meta?: Record<string, unknown>) {
    this.log('debug', msg, meta);
  }

  // Additional methods for compatibility
  success(msg: string, meta?: Record<string, unknown>) {
    this.log('info', `✓ ${msg}`, meta);
  }

  header(msg: string) {
    this.log('info', `\n=== ${msg} ===`);
  }

  log(msg: string, meta?: Record<string, unknown>) {
    this.info(msg, meta);
  }

  warning(msg: string, meta?: Record<string, unknown>) {
    this.warn(msg, meta);
  }

  summary(msg: string, meta?: Record<string, unknown>) {
    this.log('info', `\n📊 ${msg}`, meta);
  }
}

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
