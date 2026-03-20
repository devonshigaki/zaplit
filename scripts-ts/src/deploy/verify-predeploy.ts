#!/usr/bin/env node
/**
 * Pre-Deployment Verification Script (TypeScript Port)
 * Ported from: scripts/legacy/verify-predeploy.sh
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { GcpClient } from '../lib/gcp.js';
import { logger } from '../lib/logger.js';
import type { CheckResult, PredeployConfig, VerificationReport } from '../types/verification.js';

interface CLIOptions {
  instance?: string;
  zone?: string;
  project?: string;
  n8nUrl?: string;
  json?: boolean;
}

class PredeployVerifier {
  private checks: CheckResult[] = [];
  private startTime: Date;
  private gcp: GcpClient;

  constructor(private config: PredeployConfig) {
    this.startTime = new Date();
    this.gcp = new GcpClient({
      projectId: config.projectId,
      zone: config.zone,
      instanceName: config.instanceName,
    });
  }

  private addCheck(result: CheckResult): void {
    this.checks.push(result);
    this.logCheck(result);
  }

  private logCheck(result: CheckResult): void {
    const symbol = result.status === 'pass'
      ? chalk.green('✓')
      : result.status === 'warn'
        ? chalk.yellow('⚠')
        : chalk.red('✗');

    if (result.status === 'fail') {
      console.log(`${symbol} ${chalk.bold(result.name)}: ${chalk.red(result.message)}`);
    } else if (result.status === 'warn') {
      console.log(`${symbol} ${chalk.bold(result.name)}: ${chalk.yellow(result.message)}`);
    } else {
      console.log(`${symbol} ${chalk.bold(result.name)}: ${chalk.green(result.message)}`);
    }

    if (result.details) {
      for (const [key, value] of Object.entries(result.details)) {
        console.log(`  ${chalk.gray(`${key}: ${value}`)}`);
      }
    }
  }

  async verifyGcloud(): Promise<void> {
    console.log(chalk.bold('\nChecking GCP CLI'));

    const { installed, version } = await this.gcp.verifyGcloudInstalled();

    if (!installed) {
      this.addCheck({
        name: 'gcloud CLI',
        status: 'fail',
        message: 'gcloud CLI not installed',
        details: {
          installUrl: 'https://cloud.google.com/sdk/docs/install',
        },
        timestamp: new Date(),
      });
      return;
    }

    this.addCheck({
      name: 'gcloud CLI',
      status: 'pass',
      message: 'gcloud CLI installed',
      details: { version },
      timestamp: new Date(),
    });
  }

  async verifyGcpAuth(): Promise<void> {
    console.log(chalk.bold('\nChecking GCP Authentication'));

    const { authenticated, account, project } = await this.gcp.verifyAuth();

    if (!authenticated) {
      this.addCheck({
        name: 'GCP Authentication',
        status: 'fail',
        message: 'Not authenticated with gcloud',
        details: { help: 'Run: gcloud auth login' },
        timestamp: new Date(),
      });
      return;
    }

    this.addCheck({
      name: 'GCP Authentication',
      status: 'pass',
      message: `Authenticated as: ${account}`,
      timestamp: new Date(),
    });

    if (!project) {
      this.addCheck({
        name: 'GCP Project',
        status: 'warn',
        message: 'No GCP project configured',
        details: { help: `Run: gcloud config set project ${this.config.projectId}` },
        timestamp: new Date(),
      });
    } else {
      this.addCheck({
        name: 'GCP Project',
        status: 'pass',
        message: `Project configured: ${project}`,
        timestamp: new Date(),
      });
    }
  }

  async verifySshAccess(): Promise<void> {
    console.log(chalk.bold('\nChecking SSH Access'));

    const accessible = await this.gcp.testSsh();

    if (accessible) {
      this.addCheck({
        name: 'SSH Access',
        status: 'pass',
        message: `SSH access confirmed to ${this.config.instanceName}`,
        timestamp: new Date(),
      });
    } else {
      this.addCheck({
        name: 'SSH Access',
        status: 'fail',
        message: `Cannot SSH to ${this.config.instanceName}`,
        details: { help: 'Check SSH keys and IAP permissions' },
        timestamp: new Date(),
      });
    }
  }

  async verifyInstance(): Promise<void> {
    console.log(chalk.bold('\nChecking Instance Status'));

    const { exists, status } = await this.gcp.getInstanceStatus();

    if (!exists) {
      this.addCheck({
        name: 'Instance Exists',
        status: 'fail',
        message: `Instance ${this.config.instanceName} not found in zone ${this.config.zone}`,
        timestamp: new Date(),
      });
      return;
    }

    this.addCheck({
      name: 'Instance Exists',
      status: 'pass',
      message: 'Instance exists',
      timestamp: new Date(),
    });

    if (status === 'RUNNING') {
      this.addCheck({
        name: 'Instance Status',
        status: 'pass',
        message: 'Instance status: RUNNING',
        timestamp: new Date(),
      });
    } else {
      this.addCheck({
        name: 'Instance Status',
        status: 'warn',
        message: `Instance status: ${status}`,
        timestamp: new Date(),
      });
    }
  }

  async verifyDocker(): Promise<void> {
    console.log(chalk.bold('\nChecking Docker'));

    try {
      const dockerVersion = await this.gcp.sshCommand(
        "docker version --format '{{.Server.Version}}'"
      );

      this.addCheck({
        name: 'Docker',
        status: 'pass',
        message: `Docker running (version: ${dockerVersion})`,
        timestamp: new Date(),
      });

      try {
        const composeVersion = await this.gcp.sshCommand(
          "docker-compose version --short"
        );
        this.addCheck({
          name: 'Docker Compose',
          status: 'pass',
          message: `Docker Compose available (version: ${composeVersion})`,
          timestamp: new Date(),
        });
      } catch {
        this.addCheck({
          name: 'Docker Compose',
          status: 'warn',
          message: 'Docker Compose version check failed',
          timestamp: new Date(),
        });
      }
    } catch {
      this.addCheck({
        name: 'Docker',
        status: 'fail',
        message: 'Docker not accessible',
        timestamp: new Date(),
      });
    }
  }

  async verifyN8n(): Promise<void> {
    console.log(chalk.bold('\nChecking n8n'));

    try {
      const container = await this.gcp.sshCommand(
        "docker ps --filter 'name=n8n' --format '{{.Names}}'"
      );

      if (container) {
        this.addCheck({
          name: 'n8n Container',
          status: 'pass',
          message: 'n8n container running',
          timestamp: new Date(),
        });
      } else {
        this.addCheck({
          name: 'n8n Container',
          status: 'fail',
          message: 'n8n container not found',
          timestamp: new Date(),
        });
      }

      // Check health endpoint
      try {
        const response = await fetch(`${this.config.n8nUrl}/healthz`);
        if (response.status === 200) {
          this.addCheck({
            name: 'n8n Health',
            status: 'pass',
            message: 'n8n health check passed (HTTP 200)',
            timestamp: new Date(),
          });
        } else {
          this.addCheck({
            name: 'n8n Health',
            status: 'warn',
            message: `n8n health check returned HTTP ${response.status}`,
            timestamp: new Date(),
          });
        }
      } catch {
        this.addCheck({
          name: 'n8n Health',
          status: 'warn',
          message: 'n8n health check failed (connection error)',
          timestamp: new Date(),
        });
      }

      // Get version
      try {
        const version = await this.gcp.sshCommand(
          'docker exec n8n n8n --version 2>/dev/null || echo unknown'
        );
        this.addCheck({
          name: 'n8n Version',
          status: 'pass',
          message: `n8n version: ${version}`,
          timestamp: new Date(),
        });
      } catch {
        // Version check is informational
      }
    } catch {
      this.addCheck({
        name: 'n8n Container',
        status: 'fail',
        message: 'Failed to check n8n container',
        timestamp: new Date(),
      });
    }
  }

  async verifyDiskSpace(): Promise<void> {
    console.log(chalk.bold('\nChecking Disk Space'));

    try {
      const usage = await this.gcp.sshCommand(
        "df /opt | awk 'NR==2 {print $5}' | sed 's/%//'"
      );
      const usagePercent = parseInt(usage, 10);

      if (usagePercent < 70) {
        this.addCheck({
          name: 'Disk Space',
          status: 'pass',
          message: `Disk usage: ${usagePercent}%`,
          timestamp: new Date(),
        });
      } else if (usagePercent < 85) {
        this.addCheck({
          name: 'Disk Space',
          status: 'warn',
          message: `Disk usage: ${usagePercent}% (consider cleanup)`,
          timestamp: new Date(),
        });
      } else {
        this.addCheck({
          name: 'Disk Space',
          status: 'fail',
          message: `Disk usage critical: ${usagePercent}%`,
          timestamp: new Date(),
        });
      }
    } catch {
      this.addCheck({
        name: 'Disk Space',
        status: 'fail',
        message: 'Failed to check disk space',
        timestamp: new Date(),
      });
    }
  }

  async verifyBackupDirs(): Promise<void> {
    console.log(chalk.bold('\nChecking Backup Directories'));

    try {
      await this.gcp.sshCommand(`sudo mkdir -p /opt/n8n/backups && sudo mkdir -p /opt/n8n/scripts && sudo mkdir -p /var/log`);

      this.addCheck({
        name: 'Backup Directories',
        status: 'pass',
        message: 'Backup directories ready',
        timestamp: new Date(),
      });
    } catch {
      this.addCheck({
        name: 'Backup Directories',
        status: 'fail',
        message: 'Failed to create backup directories',
        timestamp: new Date(),
      });
    }
  }

  async verifyGcs(): Promise<void> {
    console.log(chalk.bold('\nChecking GCS Access'));

    const bucketExists = await this.gcp.checkGcsBucket('zaplit-n8n-backups');

    if (bucketExists) {
      this.addCheck({
        name: 'GCS Bucket',
        status: 'pass',
        message: 'GCS bucket exists: gs://zaplit-n8n-backups',
        timestamp: new Date(),
      });
    } else {
      this.addCheck({
        name: 'GCS Bucket',
        status: 'warn',
        message: 'GCS bucket not found (will be created during deployment)',
        timestamp: new Date(),
      });
    }
  }

  async runAllChecks(): Promise<VerificationReport> {
    console.log(chalk.bold.blue('\n=================================='));
    console.log(chalk.bold.blue('Pre-Deployment Verification'));
    console.log(chalk.bold.blue('=================================='));
    console.log(`Instance: ${this.config.instanceName}`);
    console.log(`Zone: ${this.config.zone}`);
    console.log(`Date: ${new Date().toISOString()}\n`);

    await this.verifyGcloud();
    await this.verifyGcpAuth();
    await this.verifySshAccess();
    await this.verifyInstance();
    await this.verifyDocker();
    await this.verifyN8n();
    await this.verifyDiskSpace();
    await this.verifyBackupDirs();
    await this.verifyGcs();

    return this.generateReport();
  }

  private generateReport(): VerificationReport {
    const passed = this.checks.filter(c => c.status === 'pass').length;
    const failed = this.checks.filter(c => c.status === 'fail').length;
    const warnings = this.checks.filter(c => c.status === 'warn').length;
    const completedAt = new Date();

    return {
      summary: {
        passed,
        failed,
        warnings,
        total: this.checks.length,
      },
      checks: this.checks,
      metadata: {
        instanceName: this.config.instanceName,
        zone: this.config.zone,
        projectId: this.config.projectId,
        startedAt: this.startTime,
        completedAt,
        duration: completedAt.getTime() - this.startTime.getTime(),
      },
    };
  }

  printSummary(report: VerificationReport): void {
    console.log(chalk.bold.blue('\n=================================='));
    console.log(chalk.bold.blue('Pre-Deployment Verification Summary'));
    console.log(chalk.bold.blue('=================================='));
    console.log(`${chalk.green('Passed:')}  ${report.summary.passed}`);
    console.log(`${chalk.yellow('Warnings:')} ${report.summary.warnings}`);
    console.log(`${chalk.red('Failed:')}  ${report.summary.failed}`);
    console.log(chalk.bold.blue('==================================\n'));

    if (report.summary.failed === 0) {
      console.log(chalk.green('✓ All critical checks passed!'));
      console.log('Ready for Phase 1 deployment.\n');
      console.log('Next steps:');
      console.log('  1. Review DEPLOYMENT_PHASE1_GUIDE.md');
      console.log('  2. Complete DEPLOYMENT_CHECKLIST.md');
      console.log('  3. Run: ./scripts/deploy-phase1.sh');
    } else {
      console.log(chalk.red('✗ Pre-deployment checks failed.'));
      console.log('Please address failures before proceeding.');
    }
  }
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('verify-predeploy')
    .description('Verify all prerequisites before Phase 1 deployment')
    .version('1.0.0')
    .option('-i, --instance <name>', 'Instance name', 'n8n-instance')
    .option('-z, --zone <zone>', 'GCP zone', 'us-central1-a')
    .option('-p, --project <project>', 'GCP project ID', 'zaplit-production')
    .option('-u, --n8n-url <url>', 'n8n URL', 'https://n8n.zaplit.com')
    .option('--json', 'Output results as JSON')
    .parse();

  const options = program.opts<CLIOptions>();

  const config: PredeployConfig = {
    instanceName: options.instance!,
    zone: options.zone!,
    projectId: options.project!,
    n8nUrl: options.n8nUrl!,
  };

  const verifier = new PredeployVerifier(config);

  try {
    const report = await verifier.runAllChecks();

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      verifier.printSummary(report);
    }

    process.exit(report.summary.failed > 0 ? 1 : 0);
  } catch (error) {
    logger.error({ error }, 'Verification failed with error');
    console.error(chalk.red('Verification failed:'), error);
    process.exit(1);
  }
}

main();
