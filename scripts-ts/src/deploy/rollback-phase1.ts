#!/usr/bin/env node
/**
 * Emergency Rollback Script (TypeScript Port)
 * Ported from: scripts/legacy/rollback-phase1.sh
 */
import { Command } from 'commander';
import chalk from 'chalk';
import readline from 'readline';
import { GcpClient } from '../lib/gcp.js';
import { logger } from '../lib/logger.js';
import { RollbackReporter } from '../lib/reporters.js';
import type {
  RollbackOptions,
  RollbackContext,
  RollbackComponent,
  RollbackResult,
  RollbackReport,
  ChangeRecord,
} from '../types/index.js';

interface CLIOptions {
  component?: string;
  dryRun?: boolean;
  force?: boolean;
}

class ConfirmationManager {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  async confirmRollback(options: RollbackOptions): Promise<boolean> {
    this.printWarningBanner(options);

    // Tier 1: Base confirmation
    const baseConfirmed = await this.promptExactMatch(
      chalk.yellow("Type 'ROLLBACK' to confirm:") + ' ',
      'ROLLBACK',
      'Rollback cancelled'
    );
    if (!baseConfirmed) return false;

    // Tier 2: Security-specific confirmation
    if (options.components.includes('security') || options.components.includes('all')) {
      console.log(chalk.red('\n⚠️  SECURITY ROLLBACK DETECTED'));
      console.log(chalk.yellow('This will REMOVE encryption and authentication!'));

      const securityConfirmed = await this.promptExactMatch(
        chalk.yellow("Type 'REMOVE SECURITY' to confirm:") + ' ',
        'REMOVE SECURITY',
        'Security rollback cancelled'
      );
      if (!securityConfirmed) return false;
    }

    // Final countdown
    return this.executeCountdown(5);
  }

  private async promptExactMatch(
    prompt: string,
    expected: string,
    cancelMessage: string
  ): Promise<boolean> {
    const input = await this.question(prompt);

    if (input !== expected) {
      console.log(chalk.blue(`[INFO] ${cancelMessage}`));
      return false;
    }
    return true;
  }

  private async executeCountdown(seconds: number): Promise<boolean> {
    console.log(chalk.cyan('\nStarting rollback in:'));

    for (let i = seconds; i > 0; i--) {
      process.stdout.write(chalk.cyan(`  ${i}... `));
      await this.sleep(1000);
    }
    console.log('\n');
    return true;
  }

  private question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(prompt, resolve);
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private printWarningBanner(options: RollbackOptions): void {
    console.log(chalk.bold.red('\n╔════════════════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold.red('║                    ⚠️  EMERGENCY ROLLBACK  ⚠️                       ║'));
    console.log(chalk.bold.red('║                     Phase 1 Deployment Revert                      ║'));
    console.log(chalk.bold.red('╚════════════════════════════════════════════════════════════════════╝'));

    console.log(chalk.yellow('\nComponents to rollback:'));
    if (options.components.includes('all') || options.components.includes('security')) {
      console.log(chalk.red('  ✗ Security Hardening (will disable auth!)'));
    }
    if (options.components.includes('all') || options.components.includes('dr')) {
      console.log(chalk.red('  ✗ Disaster Recovery (will remove backups!)'));
    }
    if (options.components.includes('all') || options.components.includes('monitoring')) {
      console.log(chalk.red('  ✗ Monitoring Stack (will stop Prometheus/Grafana!)'));
    }

    console.log(chalk.red('\n⚠️  This action may cause DOWNTIME and DATA LOSS!'));
    console.log('');
  }

  close(): void {
    this.rl.close();
  }
}

class RollbackOperation {
  constructor(
    private context: RollbackContext,
    private gcp: GcpClient
  ) {}

  async rollbackSecurity(): Promise<RollbackResult> {
    const startTime = Date.now();
    const changes: ChangeRecord[] = [];

    try {
      console.log(chalk.yellow('  Stopping containers...'));
      await this.gcp.sshCommand('cd /opt/n8n && sudo docker-compose down');

      console.log(chalk.yellow('  Restoring configuration...'));
      const backupFile = await this.findLatestBackup('docker-compose.yml.pre-*');
      if (backupFile) {
        await this.gcp.sshCommand(`sudo cp '${backupFile}' /opt/n8n/docker-compose.yml`);
      }

      console.log(chalk.yellow('  Restarting containers...'));
      await this.gcp.sshCommand('cd /opt/n8n && sudo docker-compose up -d');

      changes.push({
        id: `security-${Date.now()}`,
        timestamp: new Date(),
        component: 'security',
        action: 'restore_docker_compose',
        targetPath: '/opt/n8n/docker-compose.yml',
        backupPath: backupFile || undefined,
        metadata: {},
      });

      return {
        success: true,
        component: 'security',
        duration: Date.now() - startTime,
        changes,
      };
    } catch (error) {
      return {
        success: false,
        component: 'security',
        duration: Date.now() - startTime,
        changes,
        error: error as Error,
      };
    }
  }

  async rollbackDr(): Promise<RollbackResult> {
    const startTime = Date.now();
    const changes: ChangeRecord[] = [];

    try {
      console.log(chalk.yellow('  Removing cron jobs...'));
      await this.gcp.sshCommand('crontab -l 2>/dev/null | grep -v backup-database | crontab -');

      console.log(chalk.yellow('  Reverting Docker restart policy...'));
      await this.gcp.sshCommand('sudo sed -i \'s/restart: always/restart: unless-stopped/g\' /opt/n8n/docker-compose.yml');

      changes.push({
        id: `dr-${Date.now()}`,
        timestamp: new Date(),
        component: 'dr',
        action: 'remove_cron_jobs',
        targetPath: '/var/spool/cron/crontabs',
        metadata: {},
      });

      return {
        success: true,
        component: 'dr',
        duration: Date.now() - startTime,
        changes,
      };
    } catch (error) {
      return {
        success: false,
        component: 'dr',
        duration: Date.now() - startTime,
        changes,
        error: error as Error,
      };
    }
  }

  async rollbackMonitoring(): Promise<RollbackResult> {
    const startTime = Date.now();
    const changes: ChangeRecord[] = [];

    try {
      console.log(chalk.yellow('  Stopping monitoring containers...'));
      await this.gcp.sshCommand('cd /opt/n8n && sudo docker-compose stop prometheus grafana node-exporter 2>/dev/null || true');

      console.log(chalk.yellow('  Removing monitoring containers...'));
      await this.gcp.sshCommand('cd /opt/n8n && sudo docker-compose rm -f prometheus grafana node-exporter 2>/dev/null || true');

      changes.push({
        id: `monitoring-${Date.now()}`,
        timestamp: new Date(),
        component: 'monitoring',
        action: 'remove_containers',
        targetPath: 'prometheus,grafana,node-exporter',
        metadata: {},
      });

      return {
        success: true,
        component: 'monitoring',
        duration: Date.now() - startTime,
        changes,
      };
    } catch (error) {
      return {
        success: false,
        component: 'monitoring',
        duration: Date.now() - startTime,
        changes,
        error: error as Error,
      };
    }
  }

  private async findLatestBackup(pattern: string): Promise<string | null> {
    try {
      const result = await this.gcp.sshCommand(
        `ls -t /opt/n8n/backups/${pattern} 2>/dev/null | head -1`
      );
      return result || null;
    } catch {
      return null;
    }
  }
}

class RollbackManager {
  private confirmationManager: ConfirmationManager;
  private operation: RollbackOperation;

  constructor(private context: RollbackContext) {
    this.confirmationManager = new ConfirmationManager();
    const gcp = new GcpClient({
      projectId: context.projectId,
      zone: context.zone,
      instanceName: context.instanceName,
    });
    this.operation = new RollbackOperation(context, gcp);
  }

  async execute(): Promise<RollbackReport> {
    const startTime = Date.now();

    try {
      // Confirmations
      if (!this.context.options.force && !this.context.options.dryRun) {
        const confirmed = await this.confirmationManager.confirmRollback(this.context.options);
        if (!confirmed) {
          return { cancelled: true, success: false, results: [], duration: 0 };
        }
      }

      const results: RollbackResult[] = [];

      // Execute rollbacks
      for (const component of this.context.options.components) {
        if (component === 'all') continue;

        const result = await this.executeComponentRollback(component);
        results.push(result);
      }

      const success = results.every(r => r.success);

      return {
        cancelled: false,
        success,
        results,
        duration: Date.now() - startTime,
      };
    } finally {
      this.confirmationManager.close();
    }
  }

  private async executeComponentRollback(component: RollbackComponent): Promise<RollbackResult> {
    console.log(chalk.bold.cyan(`\nRolling back ${component.toUpperCase()}...`));

    if (this.context.options.dryRun) {
      console.log(chalk.yellow(`[DRY RUN] Would rollback ${component}`));
      return {
        success: true,
        component,
        duration: 0,
        changes: [],
      };
    }

    switch (component) {
      case 'security':
        return this.operation.rollbackSecurity();
      case 'dr':
        return this.operation.rollbackDr();
      case 'monitoring':
        return this.operation.rollbackMonitoring();
      default:
        return {
          success: false,
          component,
          duration: 0,
          changes: [],
          error: new Error(`Unknown component: ${component}`),
        };
    }
  }
}

function parseComponents(componentStr?: string): RollbackComponent[] {
  if (!componentStr || componentStr === 'all') {
    return ['security', 'dr', 'monitoring'];
  }

  const valid = ['security', 'dr', 'monitoring', 'all'];
  if (!valid.includes(componentStr)) {
    throw new Error(`Invalid component: ${componentStr}. Valid: ${valid.join(', ')}`);
  }

  if (componentStr === 'all') {
    return ['security', 'dr', 'monitoring'];
  }

  return [componentStr as RollbackComponent];
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('rollback-phase1')
    .description('Emergency rollback of Phase 1 changes')
    .version('1.0.0')
    .option('--component <name>', 'Component to rollback (security|dr|monitoring|all)', 'all')
    .option('--dry-run', 'Preview rollback without making changes', false)
    .option('--force', 'Skip confirmation prompts (DANGEROUS)', false)
    .parse();

  const options = program.opts<CLIOptions>();

  const context: RollbackContext = {
    instanceName: process.env.INSTANCE_NAME || 'n8n-instance',
    zone: process.env.ZONE || 'us-central1-a',
    projectId: process.env.PROJECT_ID || 'zaplit-production',
    backupTimestamp: new Date().toISOString().replace(/[:.]/g, '-'),
    options: {
      components: parseComponents(options.component),
      dryRun: options.dryRun!,
      force: options.force!,
      interactive: !options.force!,
    },
  };

  const manager = new RollbackManager(context);

  try {
    const report = await manager.execute();

    const reporter = new RollbackReporter();
    reporter.render(report);

    process.exit(report.success ? 0 : 1);
  } catch (error) {
    logger.error({ error }, 'Rollback failed with error');
    console.error(chalk.red('Rollback failed:'), error);
    process.exit(1);
  }
}

main();
