#!/usr/bin/env node
/**
 * Phase 1 Deployment Orchestrator (TypeScript Port)
 * Ported from: scripts/legacy/deploy-phase1.sh
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { GcpClient } from '../lib/gcp.js';
import { logger } from '../lib/logger.js';
import { DeploymentReporter } from '../lib/reporters.js';
import type {
  DeploymentConfig,
  DeploymentPhase,
  DeploymentReport,
  DeploymentStatus,
  PhaseOptions,
} from '../types/index.js';

interface CLIOptions {
  instance?: string;
  zone?: string;
  project?: string;
  n8nUrl?: string;
  dryRun?: boolean;
  skipSecurity?: boolean;
  skipDr?: boolean;
  skipMonitoring?: boolean;
  skipDataQuality?: boolean;
  force?: boolean;
}

class DeploymentState {
  private phases: Map<DeploymentPhase, { status: DeploymentStatus; steps: string[]; duration?: number }> = new Map();

  markInProgress(phase: DeploymentPhase): void {
    this.phases.set(phase, { status: 'in_progress', steps: [] });
  }

  markCompleted(phase: DeploymentPhase): void {
    const current = this.phases.get(phase);
    if (current) {
      current.status = 'completed';
    }
  }

  markFailed(phase: DeploymentPhase, error: Error): void {
    const current = this.phases.get(phase);
    if (current) {
      current.status = 'failed';
    }
  }

  markSkipped(phase: DeploymentPhase): void {
    this.phases.set(phase, { status: 'skipped', steps: [] });
  }

  markDryRun(phase: DeploymentPhase): void {
    this.phases.set(phase, { status: 'dry_run', steps: [] });
  }

  getReport(): DeploymentReport['phases'] {
    const result: DeploymentReport['phases'] = {};
    for (const [phase, data] of this.phases) {
      result[phase] = {
        status: data.status,
        steps: data.steps.map(s => ({
          id: s,
          phase,
          name: s,
          status: data.status,
          logs: [],
        })),
        duration: data.duration || 0,
      };
    }
    return result;
  }
}

class DeploymentOrchestrator {
  private state: DeploymentState;
  private startTime: Date;
  private gcp: GcpClient;

  constructor(private config: DeploymentConfig) {
    this.startTime = new Date();
    this.state = new DeploymentState();
    this.gcp = new GcpClient({
      projectId: config.projectId,
      zone: config.zone,
      instanceName: config.instanceName,
    });
  }

  async deploy(): Promise<DeploymentReport> {
    this.printBanner();

    try {
      // Phase 0: Prerequisites
      await this.runPhase('prerequisites', () => this.checkPrerequisites(), { critical: true });

      // Phase 1A: Security
      if (!this.config.skipSecurity) {
        await this.runPhase('security', () => this.deploySecurity(), { critical: true, supportsRollback: true });
      } else {
        this.state.markSkipped('security');
        logger.info('Skipping security deployment');
      }

      // Phase 1B: DR
      if (!this.config.skipDr) {
        await this.runPhase('dr', () => this.deployDr(), { supportsRollback: true });
      } else {
        this.state.markSkipped('dr');
        logger.info('Skipping DR deployment');
      }

      // Phase 1C: Monitoring
      if (!this.config.skipMonitoring) {
        await this.runPhase('monitoring', () => this.deployMonitoring(), { supportsRollback: true });
      } else {
        this.state.markSkipped('monitoring');
        logger.info('Skipping monitoring deployment');
      }

      // Phase 1D: Data Quality
      if (!this.config.skipDataQuality) {
        await this.runPhase('data_quality', () => this.deployDataQuality(), { manualStepsRequired: true });
      } else {
        this.state.markSkipped('data_quality');
        logger.info('Skipping data quality deployment');
      }

      return this.generateReport('success');
    } catch (error) {
      logger.error({ error }, 'Deployment failed');
      return this.generateReport('failed');
    }
  }

  private async runPhase(
    phase: DeploymentPhase,
    phaseFn: () => Promise<void>,
    options: PhaseOptions = {}
  ): Promise<void> {
    this.state.markInProgress(phase);
    logger.info({ phase }, `Starting deployment phase: ${phase}`);
    console.log(chalk.bold.cyan(`\n=== Phase: ${phase.toUpperCase()} ===`));

    try {
      if (this.config.dryRun) {
        console.log(chalk.yellow(`[DRY RUN] Would execute phase: ${phase}`));
        this.state.markDryRun(phase);
        return;
      }

      await phaseFn();
      this.state.markCompleted(phase);
      console.log(chalk.green(`✓ Phase ${phase} completed`));
    } catch (error) {
      this.state.markFailed(phase, error as Error);
      console.log(chalk.red(`✗ Phase ${phase} failed`));
      throw error;
    }
  }

  private async checkPrerequisites(): Promise<void> {
    console.log('Checking prerequisites...');

    // Verify gcloud
    const { installed } = await this.gcp.verifyGcloudInstalled();
    if (!installed) {
      throw new Error('gcloud CLI not installed');
    }

    // Verify auth
    const { authenticated } = await this.gcp.verifyAuth();
    if (!authenticated) {
      throw new Error('Not authenticated with gcloud');
    }

    // Verify SSH
    const accessible = await this.gcp.testSsh();
    if (!accessible) {
      throw new Error('Cannot SSH to instance');
    }

    console.log(chalk.green('✓ All prerequisites met'));
  }

  private async deploySecurity(): Promise<void> {
    console.log('Deploying security hardening...');

    // Enable basic auth
    console.log('  Enabling basic authentication...');
    await this.gcp.sshCommand(`
      cd /opt/n8n &&
      sudo sed -i 's/N8N_BASIC_AUTH_ACTIVE=.*/N8N_BASIC_AUTH_ACTIVE=true/' docker-compose.yml
    `);

    // Verify encryption key
    console.log('  Verifying encryption key...');
    const key = await this.gcp.sshCommand(
      'grep N8N_ENCRYPTION_KEY /opt/n8n/docker-compose.yml | cut -d= -f2 | tr -d " "'
    );
    if (!key || key.length < 64) {
      throw new Error('Invalid encryption key');
    }

    console.log(chalk.green('✓ Security hardening deployed'));
  }

  private async deployDr(): Promise<void> {
    console.log('Deploying disaster recovery...');

    // Create backup directories
    console.log('  Creating backup directories...');
    await this.gcp.sshCommand(`
      sudo mkdir -p /opt/n8n/backups &&
      sudo mkdir -p /opt/n8n/scripts
    `);

    // Setup cron job
    console.log('  Configuring backup cron job...');
    await this.gcp.sshCommand(`
      (crontab -l 2>/dev/null | grep -v backup; 
       echo '0 3 * * * /opt/n8n/scripts/backup-database.sh >> /var/log/n8n-backup.log 2>&1') | crontab -
    `);

    // Enable Docker auto-restart
    console.log('  Enabling Docker auto-restart...');
    await this.gcp.sshCommand(`
      sudo sed -i 's/restart: unless-stopped/restart: always/g' /opt/n8n/docker-compose.yml
    `);

    console.log(chalk.green('✓ Disaster recovery deployed'));
  }

  private async deployMonitoring(): Promise<void> {
    console.log('Deploying monitoring stack...');

    // Check if monitoring config exists
    console.log('  Setting up Prometheus and Grafana...');

    // Create monitoring directories
    await this.gcp.sshCommand('sudo mkdir -p /opt/n8n/monitoring');

    console.log(chalk.yellow('  Note: Complete monitoring setup requires manual configuration'));
    console.log(chalk.green('✓ Monitoring configuration started'));
  }

  private async deployDataQuality(): Promise<void> {
    console.log('Configuring data quality...');

    console.log(chalk.yellow('\nManual steps required:'));
    console.log('  1. Import workflow via n8n UI');
    console.log('  2. Verify CRM credentials');
    console.log('  3. Test form submission');

    this.state.markDryRun('data_quality');
  }

  private generateReport(status: 'success' | 'failed'): DeploymentReport {
    const phases = this.state.getReport();
    const completed = Object.values(phases).filter(p => p.status === 'completed').length;
    const failed = Object.values(phases).filter(p => p.status === 'failed').length;
    const skipped = Object.values(phases).filter(p => p.status === 'skipped').length;

    return {
      status,
      phases,
      summary: {
        totalPhases: Object.keys(phases).length,
        completed,
        failed,
        skipped,
      },
      metadata: {
        startedAt: this.startTime,
        completedAt: new Date(),
        duration: Date.now() - this.startTime.getTime(),
        dryRun: this.config.dryRun,
      },
    };
  }

  private printBanner(): void {
    console.log(chalk.bold.cyan('\n╔════════════════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold.cyan('║              Phase 1 (Stabilize) Deployment Script                 ║'));
    console.log(chalk.bold.cyan('║                    Production Deployment                           ║'));
    console.log(chalk.bold.cyan('╚════════════════════════════════════════════════════════════════════╝'));
    console.log(`Instance: ${this.config.instanceName}`);
    console.log(`Zone: ${this.config.zone}`);
    console.log(`Project: ${this.config.projectId}`);
    console.log(`Date: ${new Date().toISOString()}`);

    if (this.config.dryRun) {
      console.log(chalk.yellow('\n[DRY RUN MODE: No changes will be made]'));
    }

    console.log('');
  }
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('deploy-phase1')
    .description('Orchestrate Phase 1 deployment tasks')
    .version('1.0.0')
    .option('-i, --instance <name>', 'Instance name', 'n8n-instance')
    .option('-z, --zone <zone>', 'GCP zone', 'us-central1-a')
    .option('-p, --project <project>', 'GCP project ID', 'zaplit-production')
    .option('-u, --n8n-url <url>', 'n8n URL', 'https://n8n.zaplit.com')
    .option('--dry-run', 'Simulate deployment without making changes', false)
    .option('--skip-security', 'Skip security hardening deployment', false)
    .option('--skip-dr', 'Skip disaster recovery deployment', false)
    .option('--skip-monitoring', 'Skip monitoring deployment', false)
    .option('--skip-data-quality', 'Skip data quality deployment', false)
    .option('--force', 'Skip confirmation prompts', false)
    .parse();

  const options = program.opts<CLIOptions>();

  const config: DeploymentConfig = {
    instanceName: options.instance!,
    zone: options.zone!,
    projectId: options.project!,
    n8nUrl: options.n8nUrl!,
    crmUrl: 'https://crm.zaplit.com',
    skipSecurity: options.skipSecurity!,
    skipDr: options.skipDr!,
    skipMonitoring: options.skipMonitoring!,
    skipDataQuality: options.skipDataQuality!,
    dryRun: options.dryRun!,
    autoRollback: false,
    force: options.force!,
    interactive: !options.force!,
  };

  const orchestrator = new DeploymentOrchestrator(config);

  try {
    const report = await orchestrator.deploy();

    const reporter = new DeploymentReporter();
    reporter.render(report);

    process.exit(report.status === 'success' ? 0 : 1);
  } catch (error) {
    logger.error({ error }, 'Deployment failed with error');
    console.error(chalk.red('Deployment failed:'), error);
    process.exit(1);
  }
}

main();
