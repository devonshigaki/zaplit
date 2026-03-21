#!/usr/bin/env ts-node
/**
 * n8n Database Backup Script (TypeScript)
 * 
 * Automated PostgreSQL backup for n8n with GCS upload
 * Cron: 0 3 * * * (Daily at 3:00 AM UTC)
 * 
 * Usage: npx ts-node backup-database.ts [--dry-run]
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, statSync } from 'fs';
import { dirname } from 'path';
import { Logger } from '../lib/logger.js';
import { CommandExecutor } from '../lib/exec.js';

interface BackupConfig {
  backupDir: string;
  gcsBucket: string;
  logFile: string;
  retentionDaysLocal: number;
  retentionDaysGcs: number;
  dbContainer: string;
  dbUser: string;
  dbName: string;
  alertEmail?: string;
  slackWebhookUrl?: string;
}

interface BackupMetadata {
  backup_timestamp: string;
  hostname: string;
  database: {
    name: string;
    size: string;
    container: string;
  };
  n8n: {
    workflow_count: number;
  };
  backup_file: {
    name: string;
    size: string;
    checksum: string;
  };
  retention: {
    local_days: number;
    gcs_days: number;
  };
}

interface BackupResult {
  success: boolean;
  backupFile?: string;
  error?: string;
}

class DatabaseBackup {
  private logger: Logger;
  private executor: CommandExecutor;
  private config: BackupConfig;
  private hostname: string;
  private date: string;

  constructor(config: Partial<BackupConfig> = {}) {
    this.config = {
      backupDir: config.backupDir || '/opt/n8n/backups',
      gcsBucket: config.gcsBucket || 'gs://zaplit-n8n-backups',
      logFile: config.logFile || '/var/log/n8n-backup.log',
      retentionDaysLocal: config.retentionDaysLocal || 7,
      retentionDaysGcs: config.retentionDaysGcs || 90,
      dbContainer: config.dbContainer || 'n8n-postgres',
      dbUser: config.dbUser || 'n8n',
      dbName: config.dbName || 'n8n',
      alertEmail: config.alertEmail || 'devops@zaplit.com',
      slackWebhookUrl: config.slackWebhookUrl || process.env.SLACK_WEBHOOK_URL,
    };

    this.logger = new Logger();
    this.executor = new CommandExecutor(this.logger);
    this.hostname = this.getHostname();
    this.date = this.formatDate(new Date());
  }

  async run(): Promise<number> {
    this.logHeader();

    // Setup logging
    this.ensureLogDirectory();

    // Check prerequisites
    if (!this.checkPrerequisites()) {
      this.sendSlackNotification('FAILURE', 'Backup prerequisites check failed');
      return 1;
    }

    // Create backup
    const result = await this.createBackup();

    if (result.success && result.backupFile) {
      this.logger.success('Backup completed successfully');
      this.sendSlackNotification('SUCCESS', `Backup completed successfully. Size: ${this.getFileSize(result.backupFile)}`);
      return 0;
    } else {
      this.logger.error(result.error || 'Backup failed');
      this.sendSlackNotification('FAILURE', result.error || 'Database backup creation failed');
      this.sendEmailAlert('[ALERT] n8n Backup Failed', `Database backup failed on ${this.hostname} at ${new Date().toISOString()}`);
      return 1;
    }
  }

  private logHeader(): void {
    this.logger.header('n8n Database Backup', {
      Hostname: this.hostname,
      Date: this.date,
      GCSBucket: this.config.gcsBucket,
    });
  }

  private ensureLogDirectory(): void {
    const logDir = dirname(this.config.logFile);
    if (!existsSync(logDir)) {
      try {
        mkdirSync(logDir, { recursive: true });
      } catch {
        // Ignore errors, will log to stdout
      }
    }
  }

  private checkPrerequisites(): boolean {
    this.logger.info('Checking prerequisites...');

    // Check if Docker is running
    try {
      execSync('docker info', { stdio: 'ignore' });
    } catch {
      this.logger.error('Docker is not running or not accessible');
      return false;
    }

    // Check if PostgreSQL container is running
    const containers = execSync('docker ps --format "{{.Names}}"', { encoding: 'utf-8' });
    if (!containers.includes(this.config.dbContainer)) {
      this.logger.error(`PostgreSQL container '${this.config.dbContainer}' is not running`);
      return false;
    }

    // Create backup directory
    if (!existsSync(this.config.backupDir)) {
      mkdirSync(this.config.backupDir, { recursive: true });
    }

    // Check disk space (need at least 1GB free)
    try {
      const dfOutput = execSync(`df "${this.config.backupDir}" | awk 'NR==2 {print $4}'`, { encoding: 'utf-8' });
      const availableSpace = parseInt(dfOutput.trim(), 10);
      if (availableSpace < 1048576) { // 1GB in KB
        this.logger.error('Insufficient disk space for backup');
        return false;
      }
    } catch {
      // Skip disk check if it fails
    }

    this.logger.success('Prerequisites check passed');
    return true;
  }

  private async createBackup(): Promise<BackupResult> {
    const backupFile = `${this.config.backupDir}/n8n-db-${this.date}.sql`;
    const compressedFile = `${backupFile}.gz`;

    try {
      // Create backup
      this.logger.info(`Creating database backup: ${backupFile}`);
      execSync(`docker exec ${this.config.dbContainer} pg_dump -U ${this.config.dbUser} ${this.config.dbName} > "${backupFile}"`, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Compress
      this.logger.info('Compressing backup file');
      execSync(`gzip -f "${backupFile}"`);

      // Verify integrity
      this.logger.info('Verifying backup integrity');
      execSync(`gzip -t "${compressedFile}"`);

      const fileSize = this.getFileSize(compressedFile);
      this.logger.success(`Backup created: ${compressedFile} (${fileSize})`);

      // Upload to GCS
      if (!this.uploadToGcs(compressedFile)) {
        return { success: false, error: 'GCS upload failed' };
      }

      // Create metadata
      this.createMetadata(compressedFile);

      // Cleanup old backups
      this.cleanupOldBackups();

      return { success: true, backupFile: compressedFile };
    } catch (error) {
      // Cleanup on failure
      if (existsSync(backupFile)) unlinkSync(backupFile);
      if (existsSync(compressedFile)) unlinkSync(compressedFile);
      const err = error as Error;
      return { success: false, error: err.message };
    }
  }

  private uploadToGcs(file: string): boolean {
    const filename = file.split('/').pop() || '';
    this.logger.info(`Uploading to GCS: ${this.config.gcsBucket}/${filename}`);

    try {
      execSync(`gsutil cp "${file}" "${this.config.gcsBucket}/"`, { stdio: 'ignore' });

      // Verify upload
      execSync(`gsutil ls "${this.config.gcsBucket}/${filename}"`, { stdio: 'ignore' });
      this.logger.success('Upload verified successfully');
      return true;
    } catch (error) {
      this.logger.error('Failed to upload backup to GCS');
      return false;
    }
  }

  private createMetadata(backupFile: string): void {
    const metadataFile = `${this.config.backupDir}/n8n-db-${this.date}.meta.json`;

    // Get database size
    let dbSize = 'unknown';
    try {
      dbSize = execSync(
        `docker exec ${this.config.dbContainer} psql -U ${this.config.dbUser} -d ${this.config.dbName} ` +
        `-t -c "SELECT pg_size_pretty(pg_database_size('${this.config.dbName}'));"`,
        { encoding: 'utf-8' }
      ).trim();
    } catch {
      // Ignore errors
    }

    // Get workflow count
    let workflowCount = 0;
    try {
      const countStr = execSync(
        `docker exec ${this.config.dbContainer} psql -U ${this.config.dbUser} -d ${this.config.dbName} ` +
        `-t -c "SELECT COUNT(*) FROM workflow_entity;"`,
        { encoding: 'utf-8' }
      ).trim();
      workflowCount = parseInt(countStr, 10) || 0;
    } catch {
      // Ignore errors
    }

    // Calculate checksum
    let checksum = '';
    try {
      checksum = execSync(`md5sum "${backupFile}" | cut -d' ' -f1`, { encoding: 'utf-8' }).trim();
    } catch {
      // Ignore errors
    }

    const metadata: BackupMetadata = {
      backup_timestamp: new Date().toISOString(),
      hostname: this.hostname,
      database: {
        name: this.config.dbName,
        size: dbSize,
        container: this.config.dbContainer,
      },
      n8n: {
        workflow_count: workflowCount,
      },
      backup_file: {
        name: backupFile.split('/').pop() || '',
        size: this.getFileSize(backupFile),
        checksum,
      },
      retention: {
        local_days: this.config.retentionDaysLocal,
        gcs_days: this.config.retentionDaysGcs,
      },
    };

    writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
    this.logger.info(`Metadata created: ${metadataFile}`);
  }

  private cleanupOldBackups(): void {
    this.logger.info(`Cleaning up old backups (older than ${this.config.retentionDaysLocal} days)`);

    try {
      // Find and delete old backups
      const findCmd = `find "${this.config.backupDir}" -name "n8n-db-*.sql.gz" -mtime +${this.config.retentionDaysLocal} -type f`;
      const oldFiles = execSync(findCmd, { encoding: 'utf-8' }).trim().split('\n').filter(f => f);

      let deletedCount = 0;
      for (const file of oldFiles) {
        if (file && existsSync(file)) {
          unlinkSync(file);
          this.logger.info(`Deleted old backup: ${file.split('/').pop()}`);
          deletedCount++;
        }
      }

      // Clean up old metadata files
      const findMetaCmd = `find "${this.config.backupDir}" -name "n8n-db-*.meta.json" -mtime +${this.config.retentionDaysLocal} -type f`;
      const oldMetaFiles = execSync(findMetaCmd, { encoding: 'utf-8' }).trim().split('\n').filter(f => f);
      for (const file of oldMetaFiles) {
        if (file && existsSync(file)) {
          unlinkSync(file);
        }
      }

      this.logger.info(`Cleanup complete: ${deletedCount} files removed`);
    } catch {
      // Ignore cleanup errors
    }
  }

  private sendSlackNotification(status: 'SUCCESS' | 'FAILURE' | 'WARNING', message: string): void {
    if (!this.config.slackWebhookUrl) return;

    const colorMap = {
      SUCCESS: 'good',
      FAILURE: 'danger',
      WARNING: 'warning',
    };

    const payload = {
      attachments: [
        {
          color: colorMap[status],
          title: `n8n Database Backup - ${status}`,
          text: message,
          fields: [
            { title: 'Host', value: this.hostname, short: true },
            { title: 'Timestamp', value: new Date().toISOString(), short: true },
          ],
        },
      ],
    };

    try {
      execSync(
        `curl -s -X POST -H 'Content-type: application/json' --data '${JSON.stringify(payload)}' '${this.config.slackWebhookUrl}'`,
        { stdio: 'ignore' }
      );
    } catch {
      // Ignore notification errors
    }
  }

  private sendEmailAlert(subject: string, body: string): void {
    if (!this.config.alertEmail) return;

    try {
      execSync(`which mail`, { stdio: 'ignore' });
      execSync(`echo "${body}" | mail -s "${subject}" "${this.config.alertEmail}"`, { stdio: 'ignore' });
    } catch {
      // Ignore email errors
    }
  }

  private getHostname(): string {
    try {
      return execSync('hostname', { encoding: 'utf-8' }).trim();
    } catch {
      return 'unknown';
    }
  }

  private formatDate(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }

  private getFileSize(file: string): string {
    try {
      const size = statSync(file).size;
      const units = ['B', 'KB', 'MB', 'GB'];
      let unitIndex = 0;
      let fileSize = size;
      while (fileSize >= 1024 && unitIndex < units.length - 1) {
        fileSize /= 1024;
        unitIndex++;
      }
      return `${fileSize.toFixed(1)} ${units[unitIndex]}`;
    } catch {
      return 'unknown';
    }
  }
}

// Main execution
const main = async (): Promise<void> => {
  // Handle interruption
  process.on('SIGINT', () => {
    console.error('\nBackup script interrupted');
    process.exit(1);
  });

  process.on('SIGTERM', () => {
    console.error('\nBackup script interrupted');
    process.exit(1);
  });

  const backup = new DatabaseBackup();
  const exitCode = await backup.run();
  process.exit(exitCode);
};

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
