/**
 * Google Cloud Platform utility functions
 */

import { execCommand, execCommandSilent } from './exec.js';


export interface GCloudConfig {
  projectId: string;
  zone: string;
  region?: string;
}

export interface VMInstance {
  name: string;
  zone: string;
  status: string;
  machineType: string;
}

export interface DiskInfo {
  name: string;
  sizeGb: string;
  type: string;
}

export class GCloudClient {
  private config: GCloudConfig;

  constructor(config: GCloudConfig) {
    this.config = config;
  }

  /** Check if gcloud CLI is installed */
  async checkInstalled(): Promise<boolean> {
    return execCommandSilent('gcloud', ['--version']);
  }

  /** Check if authenticated with gcloud */
  async checkAuthenticated(): Promise<boolean> {
    try {
      const result = await execCommand('gcloud', ['auth', 'list', '--filter=status:ACTIVE', '--format=value(account)']);
      return result.stdout.includes('@');
    } catch {
      return false;
    }
  }

  /** Set the active project */
  async setProject(projectId?: string): Promise<void> {
    const project = projectId || this.config.projectId;
    await execCommand('gcloud', ['config', 'set', 'project', project], { stdio: 'ignore' });
  }

  /** Get the current project ID */
  async getCurrentProject(): Promise<string> {
    try {
      const result = await execCommand('gcloud', ['config', 'get-value', 'project']);
      return result.stdout.trim() || this.config.projectId;
    } catch {
      return this.config.projectId;
    }
  }

  /** Check if a VM instance exists */
  async instanceExists(instanceName: string, zone?: string): Promise<boolean> {
    const z = zone || this.config.zone;
    try {
      await execCommand('gcloud', ['compute', 'instances', 'describe', instanceName, `--zone=${z}`]);
      return true;
    } catch {
      return false;
    }
  }

  /** Get VM instance details */
  async getInstance(instanceName: string, zone?: string): Promise<VMInstance | null> {
    const z = zone || this.config.zone;
    try {
      const result = await execCommand('gcloud', [
        'compute', 'instances', 'describe', instanceName, 
        `--zone=${z}`, 
        '--format=json'
      ]);
      const data = JSON.parse(result.stdout);
      return {
        name: data.name,
        zone: z,
        status: data.status,
        machineType: data.machineType?.split('/').pop() || 'unknown',
      };
    } catch {
      return null;
    }
  }

  /** Get the boot disk name for an instance */
  async getBootDiskName(instanceName: string, zone?: string): Promise<string | null> {
    const z = zone || this.config.zone;
    try {
      const result = await execCommand('gcloud', [
        'compute', 'instances', 'describe', instanceName, 
        `--zone=${z}`, 
        '--format=value(disks[0].deviceName)'
      ]);
      return result.stdout.trim() || null;
    } catch {
      return null;
    }
  }

  /** SSH into an instance and run a command */
  async ssh(instanceName: string, command: string, zone?: string): Promise<{ stdout: string; stderr: string; success: boolean }> {
    const z = zone || this.config.zone;
    try {
      const result = await execCommand('gcloud', [
        'compute', 'ssh', instanceName, 
        `--zone=${z}`,
        `--command=${command}`
      ]);
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        success: true,
      };
    } catch (error) {
      const execError = error as { stdout?: string; stderr?: string };
      return {
        stdout: execError.stdout || '',
        stderr: execError.stderr || '',
        success: false,
      };
    }
  }

  /** Copy a file to an instance via SCP */
  async scp(localPath: string, remotePath: string, instanceName: string, zone?: string): Promise<boolean> {
    const z = zone || this.config.zone;
    try {
      await execCommand('gcloud', [
        'compute', 'scp', localPath, `${instanceName}:${remotePath}`,
        `--zone=${z}`
      ]);
      return true;
    } catch {
      return false;
    }
  }

  /** Create a snapshot schedule */
  async createSnapshotSchedule(
    scheduleName: string,
    options: {
      retentionDays: number;
      startTime: string;
      description?: string;
    }
  ): Promise<boolean> {
    const region = this.config.region || this.config.zone.replace(/-\w$/, '');
    try {
      await execCommand('gcloud', [
        'compute', 'resource-policies', 'create', 'snapshot-schedule', scheduleName,
        `--description=${options.description || 'Snapshot schedule'}`,
        `--max-retention-days=${options.retentionDays}`,
        '--on-source-disk-delete=keep-auto-snapshots',
        '--daily-schedule',
        `--start-time=${options.startTime}`,
        `--region=${region}`
      ]);
      return true;
    } catch {
      return false;
    }
  }

  /** Check if a snapshot schedule exists */
  async snapshotScheduleExists(scheduleName: string): Promise<boolean> {
    const region = this.config.region || this.config.zone.replace(/-\w$/, '');
    try {
      await execCommand('gcloud', [
        'compute', 'resource-policies', 'describe', scheduleName,
        `--region=${region}`
      ]);
      return true;
    } catch {
      return false;
    }
  }

  /** Delete a snapshot schedule */
  async deleteSnapshotSchedule(scheduleName: string): Promise<boolean> {
    const region = this.config.region || this.config.zone.replace(/-\w$/, '');
    try {
      await execCommand('gcloud', [
        'compute', 'resource-policies', 'delete', scheduleName,
        `--region=${region}`,
        '--quiet'
      ]);
      return true;
    } catch {
      return false;
    }
  }

  /** Attach a snapshot schedule to a disk */
  async attachSnapshotSchedule(diskName: string, scheduleName: string, zone?: string): Promise<boolean> {
    const z = zone || this.config.zone;
    try {
      await execCommand('gcloud', [
        'compute', 'disks', 'add-resource-policies', diskName,
        `--resource-policies=${scheduleName}`,
        `--zone=${z}`
      ]);
      return true;
    } catch {
      return false;
    }
  }

  /** Check if a disk has a snapshot schedule attached */
  async diskHasSchedule(diskName: string, scheduleName: string, zone?: string): Promise<boolean> {
    const z = zone || this.config.zone;
    try {
      const result = await execCommand('gcloud', [
        'compute', 'disks', 'describe', diskName,
        `--zone=${z}`,
        '--format=value(resourcePolicies)'
      ]);
      return result.stdout.includes(scheduleName);
    } catch {
      return false;
    }
  }

  /** Create or update a secret in Secret Manager */
  async createSecret(secretName: string, value: string, labels?: Record<string, string>): Promise<boolean> {
    // Check if secret exists
    let exists = false;
    try {
      await execCommand('gcloud', ['secrets', 'describe', secretName]);
      exists = true;
    } catch {
      exists = false;
    }

    if (exists) {
      // Add new version
      try {
        await execCommand('gcloud', ['secrets', 'versions', 'add', secretName, `--data-file=-`], {
          input: value,
        });
        return true;
      } catch {
        return false;
      }
    } else {
      // Create new secret
      const args = [
        'secrets', 'create', secretName,
        '--data-file=-',
        '--replication-policy=automatic'
      ];
      if (labels) {
        const labelsStr = Object.entries(labels).map(([k, v]) => `${k}=${v}`).join(',');
        args.push(`--labels=${labelsStr}`);
      }
      try {
        await execCommand('gcloud', args, { input: value });
        return true;
      } catch {
        return false;
      }
    }
  }

  /** Get the latest version of a secret */
  async getSecret(secretName: string): Promise<string | null> {
    try {
      const result = await execCommand('gcloud', [
        'secrets', 'versions', 'access', 'latest',
        `--secret=${secretName}`
      ]);
      return result.stdout || null;
    } catch {
      return null;
    }
  }

  /** Check if a secret exists */
  async secretExists(secretName: string): Promise<boolean> {
    try {
      await execCommand('gcloud', ['secrets', 'describe', secretName]);
      return true;
    } catch {
      return false;
    }
  }
}

/** Create a GCloud client with the current configuration */
export function createGCloudClient(config?: Partial<GCloudConfig>): GCloudClient {
  const defaultConfig: GCloudConfig = {
    projectId: process.env.GCP_PROJECT_ID || 'zaplit-production',
    zone: process.env.GCP_ZONE || 'us-central1-a',
    region: process.env.GCP_REGION,
  };
  return new GCloudClient({ ...defaultConfig, ...config });
}
