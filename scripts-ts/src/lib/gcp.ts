/**
 * Google Cloud Platform client wrapper
 */
import { execCommand, execCommandSilent } from './exec.js';
import { logger } from './logger.js';
import { GcpError, SshError } from './errors.js';
import type { GcpConfig } from '../types/verification.js';

export class GcpClient {
  private log;

  constructor(private config: GcpConfig) {
    this.log = logger.child({ component: 'GcpClient' });
  }

  /**
   * Check if gcloud CLI is installed
   */
  async verifyGcloudInstalled(): Promise<{ installed: boolean; version?: string }> {
    try {
      const result = await execCommand('gcloud', ['version']);
      const version = result.stdout.split('\n')[0];
      return { installed: true, version };
    } catch {
      return { installed: false };
    }
  }

  /**
   * Check GCP authentication status
   */
  async verifyAuth(): Promise<{
    authenticated: boolean;
    account?: string;
    project?: string;
  }> {
    try {
      const accountResult = await execCommand('gcloud', [
        'auth', 'list',
        '--filter=status:ACTIVE',
        '--format=value(account)',
      ]);
      const account = accountResult.stdout.trim() || undefined;

      let project: string | undefined;
      try {
        const projectResult = await execCommand('gcloud', ['config', 'get-value', 'project']);
        project = projectResult.stdout.trim() || undefined;
      } catch {
        // Project not configured
      }

      return {
        authenticated: !!account,
        account,
        project,
      };
    } catch (error) {
      throw new GcpError('Failed to check GCP authentication', error as Error);
    }
  }

  /**
   * Check if instance exists and get its status
   */
  async getInstanceStatus(): Promise<{
    exists: boolean;
    status?: string;
  }> {
    try {
      const result = await execCommand('gcloud', [
        'compute', 'instances', 'describe', this.config.instanceName,
        '--zone', this.config.zone,
        '--format=value(status)',
      ]);
      return { exists: true, status: result.stdout.trim() };
    } catch {
      return { exists: false };
    }
  }

  /**
   * Execute SSH command on the instance
   */
  async sshCommand(command: string): Promise<string> {
    try {
      const result = await execCommand('gcloud', [
        'compute', 'ssh', this.config.instanceName,
        '--zone', this.config.zone,
        '--command', command,
      ]);
      return result.stdout.trim();
    } catch (error) {
      throw new SshError(`SSH command failed: ${command}`, error as Error, {
        instance: this.config.instanceName,
        zone: this.config.zone,
      });
    }
  }

  /**
   * Test SSH connectivity
   */
  async testSsh(): Promise<boolean> {
    try {
      await this.sshCommand('echo "SSH OK"');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check GCS bucket exists
   */
  async checkGcsBucket(bucketName: string): Promise<boolean> {
    return await execCommandSilent('gsutil', ['ls', '-b', `gs://${bucketName}`]);
  }
}
