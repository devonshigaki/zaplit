#!/usr/bin/env ts-node
/**
 * GCP VM Snapshot Schedule Setup Script (TypeScript)
 * 
 * Creates and attaches snapshot schedule for n8n VM daily backups
 * 
 * Usage: npx ts-node setup-snapshots.ts [VM_NAME] [ZONE]
 */

import { Logger } from '../lib/logger.js';
import { GCloudClient, createGCloudClient } from '../lib/gcloud.js';
import { CommandExecutor } from '../lib/exec.js';

interface SnapshotConfig {
  vmName: string;
  zone: string;
  scheduleName: string;
  retentionDays: number;
  startTime: string;
  gcsBucket: string;
  region: string;
}

class SnapshotScheduleSetup {
  private logger: Logger;
  private gcloud: GCloudClient;
  private executor: CommandExecutor;
  private config: SnapshotConfig;

  constructor(config: Partial<SnapshotConfig> = {}) {
    this.config = {
      vmName: config.vmName || 'n8n-instance',
      zone: config.zone || 'us-central1-a',
      scheduleName: config.scheduleName || 'snapshot-schedule-n8n',
      retentionDays: config.retentionDays || 30,
      startTime: config.startTime || '02:00',
      gcsBucket: config.gcsBucket || 'gs://zaplit-n8n-backups',
      region: config.region || (config.zone || 'us-central1-a').replace(/-\w$/, ''),
    };

    this.logger = new Logger();
    this.executor = new CommandExecutor(this.logger);
    this.gcloud = createGCloudClient({
      zone: this.config.zone,
      region: this.config.region,
    });
  }

  async run(): Promise<number> {
    this.printHeader();

    // Check prerequisites
    if (!this.checkPrerequisites()) {
      return 1;
    }

    // Create snapshot schedule
    if (!await this.createSnapshotSchedule()) {
      return 1;
    }

    // Attach schedule to VM
    if (!this.attachScheduleToVM()) {
      return 1;
    }

    // Create backup bucket
    this.createBackupBucket();

    // Setup backup directories
    this.setupBackupDirectories();

    // Setup cron job (if backup script exists)
    await this.setupCronJob();

    this.printSummary();
    return 0;
  }

  private printHeader(): void {
    this.logger.header('GCP VM Snapshot Schedule Setup', {
      VM: this.config.vmName,
      Zone: this.config.zone,
    });
  }

  private checkPrerequisites(): boolean {
    this.logger.info('Checking prerequisites...');

    // Check gcloud
    if (!this.gcloud.checkInstalled()) {
      this.logger.error('gcloud CLI is not installed. Please install Google Cloud SDK.');
      return false;
    }

    // Check authentication
    if (!this.gcloud.checkAuthenticated()) {
      this.logger.error('Not authenticated with gcloud. Run: gcloud auth login');
      return false;
    }

    // Check VM exists
    if (!this.gcloud.instanceExists(this.config.vmName, this.config.zone)) {
      this.logger.error(`VM '${this.config.vmName}' not found in zone '${this.config.zone}'`);
      return false;
    }

    this.logger.success('Prerequisites check passed');
    return true;
  }

  private async createSnapshotSchedule(): Promise<boolean> {
    this.logger.info(`Creating snapshot schedule: ${this.config.scheduleName}`);

    // Check if schedule already exists
    if (this.gcloud.snapshotScheduleExists(this.config.scheduleName)) {
      this.logger.warn(`Snapshot schedule '${this.config.scheduleName}' already exists`);
      if (await this.askRecreate()) {
        this.logger.info('Deleting existing snapshot schedule...');
        this.gcloud.deleteSnapshotSchedule(this.config.scheduleName);
      } else {
        this.logger.info('Using existing snapshot schedule');
        return true;
      }
    }

    // Create the schedule
    const success = this.gcloud.createSnapshotSchedule(this.config.scheduleName, {
      retentionDays: this.config.retentionDays,
      startTime: this.config.startTime,
      description: 'Daily backup for n8n VM - automated by SRE',
    });

    if (success) {
      this.logger.success('Snapshot schedule created successfully');
      this.showScheduleDetails();
      return true;
    } else {
      this.logger.error('Failed to create snapshot schedule');
      return false;
    }
  }

  private showScheduleDetails(): void {
    this.logger.info('Schedule details:');
    this.executor.exec(
      `gcloud compute resource-policies describe ${this.config.scheduleName} --region=${this.config.region} ` +
      `--format="table(name, description, snapshotSchedulePolicy.schedule.dailySchedule.startTime, snapshotSchedulePolicy.retentionPolicy.maxRetentionDays)"`,
      { silent: true }
    );
  }

  private attachScheduleToVM(): boolean {
    this.logger.info(`Attaching snapshot schedule to VM: ${this.config.vmName}`);

    // Get boot disk name
    const bootDisk = this.gcloud.getBootDiskName(this.config.vmName, this.config.zone);
    if (!bootDisk) {
      this.logger.error('Could not determine boot disk name');
      return false;
    }

    this.logger.info(`Found boot disk: ${bootDisk}`);

    // Check if already attached
    if (this.gcloud.diskHasSchedule(bootDisk, this.config.scheduleName, this.config.zone)) {
      this.logger.warn(`Snapshot schedule already attached to disk '${bootDisk}'`);
      return true;
    }

    // Attach schedule
    const success = this.gcloud.attachSnapshotSchedule(bootDisk, this.config.scheduleName, this.config.zone);

    if (success) {
      this.logger.success(`Snapshot schedule attached successfully to disk: ${bootDisk}`);
      this.verifyAttachment(bootDisk);
      return true;
    } else {
      this.logger.error('Failed to attach snapshot schedule');
      return false;
    }
  }

  private verifyAttachment(diskName: string): void {
    this.logger.info('Verifying attachment...');
    this.executor.exec(
      `gcloud compute disks describe ${diskName} --zone=${this.config.zone} --format="table(name, resourcePolicies)"`,
      { silent: true }
    );
  }

  private createBackupBucket(): void {
    const bucketName = this.config.gcsBucket.replace('gs://', '');
    this.logger.info(`Checking GCS backup bucket: gs://${bucketName}`);

    const result = this.executor.exec(
      `gsutil ls -b gs://${bucketName}`,
      { silent: true, ignoreError: true }
    );

    if (result.exitCode === 0) {
      this.logger.info(`Backup bucket already exists: gs://${bucketName}`);
    } else {
      this.logger.info(`Creating GCS backup bucket: gs://${bucketName}`);
      this.executor.exec(`gsutil mb -l "${this.config.region}" "gs://${bucketName}/"`, { silent: true });

      // Set lifecycle policy
      const lifecyclePolicy = {
        lifecycle: {
          rule: [
            {
              action: { type: 'Delete' },
              condition: {
                age: 90,
                matchesPrefix: ['n8n-db-'],
              },
            },
          ],
        },
      };

      const tempFile = `/tmp/lifecycle-policy-${Date.now()}.json`;
      require('fs').writeFileSync(tempFile, JSON.stringify(lifecyclePolicy));
      this.executor.exec(`gsutil lifecycle set ${tempFile} "gs://${bucketName}/"`, { silent: true });
      require('fs').unlinkSync(tempFile);

      this.logger.info('Backup bucket created with 90-day lifecycle policy');
    }

    // Display bucket info
    this.executor.exec(
      `gsutil ls -Lb "gs://${bucketName}/" | grep -E "(Location|Storage class|Lifecycle)"`,
      { silent: true }
    );
  }

  private setupBackupDirectories(): void {
    this.logger.info('Setting up backup directories on VM...');

    const result = this.gcloud.ssh(
      this.config.vmName,
      `sudo mkdir -p /opt/n8n/backups && sudo mkdir -p /opt/n8n/scripts && sudo chown -R $(whoami):$(whoami) /opt/n8n && echo 'Backup directories created successfully'`,
      this.config.zone
    );

    if (result.success) {
      this.logger.info('Backup directories configured');
    }
  }

  private async setupCronJob(): Promise<void> {
    // Note: In TypeScript version, we don't auto-copy the script
    // Instead, we provide instructions
    this.logger.info('Cron job setup:');
    console.log('To enable automated database backups, copy the backup script to the VM and add to crontab:');
    console.log();
    console.log(`  gcloud compute scp backup-database.ts ${this.config.vmName}:/opt/n8n/scripts/ --zone=${this.config.zone}`);
    console.log(`  gcloud compute ssh ${this.config.vmName} --zone=${this.config.zone}`);
    console.log();
    console.log('  # Then on the VM:');
    console.log('  chmod +x /opt/n8n/scripts/backup-database.ts');
    console.log("  (crontab -l 2>/dev/null | grep -v backup-database; echo '0 3 * * * cd /opt/n8n/scripts && npx ts-node backup-database.ts >> /var/log/n8n-backup.log 2>&1') | crontab -");
    console.log();
  }

  private printSummary(): void {
    console.log();
    this.logger.success('Snapshot schedule setup complete!');
    console.log();
    console.log('='.repeat(42));
    console.log('  Summary');
    console.log('='.repeat(42));
    console.log(`  ✓ Snapshot Schedule: ${this.config.scheduleName}`);
    console.log(`  ✓ Daily Backup Time: ${this.config.startTime} UTC`);
    console.log(`  ✓ Retention Period: ${this.config.retentionDays} days`);
    console.log(`  ✓ Attached to VM: ${this.config.vmName}`);
    console.log(`  ✓ GCS Bucket: ${this.config.gcsBucket}`);
    console.log('='.repeat(42));
    console.log();
    console.log('Next Steps:');
    console.log(`  1. Verify first snapshot is created tomorrow at ${this.config.startTime} UTC`);
    console.log('  2. Test restore procedure using runbook RB-DR-001');
    console.log('  3. Monitor backup logs: /var/log/n8n-backup.log');
    console.log();
  }

  private async askRecreate(): Promise<boolean> {
    if (!process.stdin.isTTY) {
      return false;
    }

    process.stdout.write('Do you want to recreate it? (y/N): ');
    return new Promise((resolve) => {
      process.stdin.once('data', (data) => {
        const answer = data.toString().trim().toLowerCase();
        resolve(answer === 'y' || answer === 'yes');
      });
    });
  }
}

// Main execution
const main = async (): Promise<void> => {
  const vmName = process.argv[2] || 'n8n-instance';
  const zone = process.argv[3] || 'us-central1-a';

  const setup = new SnapshotScheduleSetup({ vmName, zone });
  const exitCode = await setup.run();
  process.exit(exitCode);
};

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
