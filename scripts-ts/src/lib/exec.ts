/**
 * Process execution wrapper with error handling
 */
import { execa, type Options as ExecaOptions } from 'execa';
import { logger } from './logger.js';

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

export interface ExecOptions extends ExecaOptions {}

/**
 * Command executor class for compatibility
 * @deprecated Use execCommand() or execCommandSilent() directly
 */
export class CommandExecutor {
  private defaultOptions: ExecOptions;
  
  constructor(options: ExecOptions = {}) {
    this.defaultOptions = options;
  }
  
  async execute(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
    return execCommand(command, args, { ...this.defaultOptions, ...options });
  }
  
  async executeSilent(command: string, args: string[], options?: ExecOptions): Promise<boolean> {
    return execCommandSilent(command, args, { ...this.defaultOptions, ...options });
  }
}
