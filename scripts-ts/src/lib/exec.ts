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
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  } catch (error: any) {
    log.error({ error: error.message, exitCode: error.exitCode }, 'Command failed');
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
