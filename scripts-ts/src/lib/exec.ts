/**
 * Process execution wrapper with error handling
 */
import { execa, type Options as ExecaOptions } from 'execa';
import { logger } from './logger.js';
import type { Logger } from './logger.js';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function execCommand(
  command: string,
  args: string[],
  options?: ExecaOptions
): Promise<ExecResult> {
  const log = logger.child({ command, args });
  log.debug('Executing command');

  try {
    const result = await execa(command, args, {
      ...options,
      all: true,
    });

    log.debug({ exitCode: result.exitCode }, 'Command completed');

    return {
      stdout: String(result.stdout ?? ''),
      stderr: String(result.stderr ?? ''),
      exitCode: result.exitCode ?? 0,
    };
  } catch (error) {
    const execError = error as { message: string; exitCode?: number };
    log.error({ error: execError.message, exitCode: execError.exitCode }, 'Command failed');
    throw error;
  }
}

export async function execCommandSilent(
  command: string,
  args: string[],
  options?: ExecaOptions
): Promise<boolean> {
  try {
    await execa(command, args, { ...options, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export interface ExecOptions extends ExecaOptions {
  silent?: boolean;
}

/**
 * Command executor class for compatibility
 * Supports:
 * - new CommandExecutor() - default options
 * - new CommandExecutor(options) - with exec options
 * - new CommandExecutor(logger) - with logger instance
 */
export class CommandExecutor {
  private defaultOptions: ExecOptions;
  private logger?: Logger;

  constructor();
  constructor(options: ExecOptions);
  constructor(logger: Logger);
  constructor(arg?: ExecOptions | Logger) {
    if (arg && 'info' in arg && typeof arg.info === 'function') {
      // It's a Logger instance
      this.logger = arg as Logger;
      this.defaultOptions = {};
    } else {
      this.defaultOptions = (arg as ExecOptions) || {};
    }
  }

  async execute(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
    return execCommand(command, args, { ...this.defaultOptions, ...options });
  }

  async executeSilent(command: string, args: string[], options?: ExecOptions): Promise<boolean> {
    return execCommandSilent(command, args, { ...this.defaultOptions, ...options });
  }

  // Compatibility methods that match the function-based API
  async exec(command: string, options?: ExecOptions): Promise<ExecResult> {
    const parts = command.split(' ');
    const cmd = parts[0];
    const args = parts.slice(1);
    return this.execute(cmd, args, options);
  }

  async execSilent(command: string, options?: ExecOptions): Promise<string> {
    const parts = command.split(' ');
    const cmd = parts[0];
    const args = parts.slice(1);
    const success = await this.executeSilent(cmd, args, options);
    return success ? 'success' : '';
  }
}
