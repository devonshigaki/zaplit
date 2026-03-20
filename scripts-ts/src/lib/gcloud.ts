/**
 * Google Cloud Platform utility functions
 */

import { CommandExecutor } from './exec';
import { Logger } from './logger';

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
  private executor: CommandExecutor;
  private logger: Logger;
  private config: GCloudConfig;

  constructor(config: GCloudConfig, logger?: Logger) {
    this.config = config;
    this.logger = logger || new Logger();
    this.executor = new CommandExecutor(this.logger);
  }

  /** Check if gcloud CLI is installed */
  checkInstalled(): boolean {
    return this.executor.commandExists('gcloud');
  }

  /** Check if authenticated with gcloud */
  checkAuthenticated(): boolean {
    const result = this.executor.execSilent(
      'gcloud auth list --filter=status:ACTIVE --format="value(account)"'
    );
    return result.includes('@');
  }

  /** Set the active project */
  setProject(projectId?: string): void {
    const project = projectId || this.config.projectId;
    this.executor.gcloud(`config set project ${project}`, { silent: true });
  }

  /** Get the current project ID */
  getCurrentProject(): string {
    const result = this.executor.execSilent('gcloud config get-value project 2>/dev/null');
    return result || this.config.projectId;
  }

  /** Check if a VM instance exists */
  instanceExists(instanceName: string, zone?: string): boolean {
    const z = zone || this.config.zone;
    const result = this.executor.gcloud(
      `compute instances describe ${instanceName} --zone=${z}`,
      { silent: true, ignoreError: true }
    );
    return result.exitCode === 0;
  }

  /** Get VM instance details */
  getInstance(instanceName: string, zone?: string): VMInstance | null {
    const z = zone || this.config.zone;
    const result = this.executor.gcloud(
      `compute instances describe ${instanceName} --zone=${z} --format=json`,
      { silent: true, ignoreError: true }
    );
    
    if (result.exitCode !== 0) return null;
    
    try {
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
  getBootDiskName(instanceName: string, zone?: string): string | null {
    const z = zone || this.config.zone;
    const result = this.executor.execSilent(
      `gcloud compute instances describe ${instanceName} --zone=${z} --format="value(disks[0].deviceName)"`
    );
    return result || null;
  }

  /** SSH into an instance and run a command */
  ssh(instanceName: string, command: string, zone?: string): { stdout: string; stderr: string; success: boolean } {
    const z = zone || this.config.zone;
    const result = this.executor.gcloudSSH(instanceName, z, command, { silent: true, ignoreError: true });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      success: result.exitCode === 0,
    };
  }

  /** Copy a file to an instance via SCP */
  scp(localPath: string, remotePath: string, instanceName: string, zone?: string): boolean {
    const z = zone || this.config.zone;
    const result = this.executor.gcloud(
      `compute scp ${localPath} ${instanceName}:${remotePath} --zone=${z}`,
      { silent: true, ignoreError: true }
    );
    return result.exitCode === 0;
  }

  /** Create a snapshot schedule */
  createSnapshotSchedule(
    scheduleName: string,
    options: {
      retentionDays: number;
      startTime: string;
      description?: string;
    }
  ): boolean {
    const region = this.config.region || this.config.zone.replace(/-\w$/, '');
    const result = this.executor.gcloud(
      `compute resource-policies create snapshot-schedule ${scheduleName} ` +
      `--description="${options.description || 'Snapshot schedule'}" ` +
      `--max-retention-days=${options.retentionDays} ` +
      `--on-source-disk-delete=keep-auto-snapshots ` +
      `--daily-schedule ` +
      `--start-time=${options.startTime} ` +
      `--region=${region}`,
      { silent: true, ignoreError: true }
    );
    return result.exitCode === 0;
  }

  /** Check if a snapshot schedule exists */
  snapshotScheduleExists(scheduleName: string): boolean {
    const region = this.config.region || this.config.zone.replace(/-\w$/, '');
    const result = this.executor.gcloud(
      `compute resource-policies describe ${scheduleName} --region=${region}`,
      { silent: true, ignoreError: true }
    );
    return result.exitCode === 0;
  }

  /** Delete a snapshot schedule */
  deleteSnapshotSchedule(scheduleName: string): boolean {
    const region = this.config.region || this.config.zone.replace(/-\w$/, '');
    const result = this.executor.gcloud(
      `compute resource-policies delete ${scheduleName} --region=${region} --quiet`,
      { silent: true, ignoreError: true }
    );
    return result.exitCode === 0;
  }

  /** Attach a snapshot schedule to a disk */
  attachSnapshotSchedule(diskName: string, scheduleName: string, zone?: string): boolean {
    const z = zone || this.config.zone;
    const result = this.executor.gcloud(
      `compute disks add-resource-policies ${diskName} ` +
      `--resource-policies=${scheduleName} ` +
      `--zone=${z}`,
      { silent: true, ignoreError: true }
    );
    return result.exitCode === 0;
  }

  /** Check if a disk has a snapshot schedule attached */
  diskHasSchedule(diskName: string, scheduleName: string, zone?: string): boolean {
    const z = zone || this.config.zone;
    const result = this.executor.execSilent(
      `gcloud compute disks describe ${diskName} --zone=${z} --format="value(resourcePolicies)"`
    );
    return result.includes(scheduleName);
  }

  /** Create or update a secret in Secret Manager */
  createSecret(secretName: string, value: string, labels?: Record<string, string>): boolean {
    // Check if secret exists
    const exists = this.executor.gcloud(
      `secrets describe ${secretName}`,
      { silent: true, ignoreError: true }
    ).exitCode === 0;

    if (exists) {
      // Add new version
      const result = this.executor.exec(
        `echo -n "${value}" | gcloud secrets versions add ${secretName} --data-file=-`,
        { silent: true, ignoreError: true }
      );
      return result.exitCode === 0;
    } else {
      // Create new secret
      const labelsStr = labels 
        ? Object.entries(labels).map(([k, v]) => `${k}=${v}`).join(',')
        : '';
      const result = this.executor.exec(
        `echo -n "${value}" | gcloud secrets create ${secretName} ` +
        `--data-file=- ` +
        `${labelsStr ? `--labels=${labelsStr} ` : ''}` +
        `--replication-policy=automatic`,
        { silent: true, ignoreError: true }
      );
      return result.exitCode === 0;
    }
  }

  /** Get the latest version of a secret */
  getSecret(secretName: string): string | null {
    const result = this.executor.execSilent(
      `gcloud secrets versions access latest --secret=${secretName}`
    );
    return result || null;
  }

  /** Check if a secret exists */
  secretExists(secretName: string): boolean {
    const result = this.executor.gcloud(
      `secrets describe ${secretName}`,
      { silent: true, ignoreError: true }
    );
    return result.exitCode === 0;
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
