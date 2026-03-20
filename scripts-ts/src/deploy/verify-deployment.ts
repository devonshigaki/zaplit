#!/usr/bin/env node
/**
 * Deployment Verification Script (TypeScript Port)
 * Ported from: scripts/legacy/verify-deployment.sh
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { GcpClient } from '../lib/gcp.js';
import { BaseVerifier } from '../lib/base-verifier.js';
import { ConsoleReporter } from '../lib/reporters.js';
import { logger } from '../lib/logger.js';
import type { CheckResult, VerificationReport, VerificationContext } from '../types/index.js';

interface CLIOptions {
  instance?: string;
  zone?: string;
  project?: string;
  n8nUrl?: string;
  crmUrl?: string;
  detailed?: boolean;
  json?: boolean;
  verbose?: boolean;
}

// ============== Verification Category Classes ==============

class ConnectivityVerifier extends BaseVerifier {
  readonly category = 'connectivity';

  async verify(): Promise<CheckResult[]> {
    const results: CheckResult[] = [];

    // SSH Connectivity
    results.push(await this.runCheck('ssh', async () => {
      const accessible = await this.gcp.testSsh();
      return {
        name: 'ssh',
        category: this.category,
        status: accessible ? 'pass' : 'fail',
        message: accessible
          ? `SSH to ${this.context.instanceName} successful`
          : `Cannot SSH to ${this.context.instanceName}`,
        timestamp: new Date(),
      };
    }));

    // Docker Status
    results.push(await this.runCheck('docker', async () => {
      const version = await this.gcp.sshCommand(
        "docker version --format '{{.Server.Version}}'"
      ).catch(() => null);

      return {
        name: 'docker',
        category: this.category,
        status: version ? 'pass' : 'fail',
        message: version ? `Docker v${version} running` : 'Docker not accessible',
        details: version ? { version } : undefined,
        timestamp: new Date(),
      };
    }));

    // n8n Version
    results.push(await this.runCheck('n8n_version', async () => {
      const version = await this.gcp.sshCommand(
        'docker exec n8n n8n --version 2>/dev/null || echo unknown'
      ).catch(() => 'unknown');

      return {
        name: 'n8n_version',
        category: this.category,
        status: version !== 'unknown' ? 'pass' : 'warn',
        message: `n8n version: ${version}`,
        timestamp: new Date(),
      };
    }));

    return results;
  }
}

class InfrastructureVerifier extends BaseVerifier {
  readonly category = 'infrastructure';

  async verify(): Promise<CheckResult[]> {
    const results: CheckResult[] = [];

    // Disk Space
    results.push(await this.runCheck('disk_space', async () => {
      const usage = await this.gcp.sshCommand(
        "df /opt | awk 'NR==2 {print $5}' | sed 's/%//'"
      ).catch(() => '100');
      const usagePercent = parseInt(usage, 10);

      return {
        name: 'disk_space',
        category: this.category,
        status: usagePercent < 85 ? 'pass' : usagePercent < 95 ? 'warn' : 'fail',
        message: `Disk usage: ${usagePercent}%`,
        timestamp: new Date(),
      };
    }));

    // Memory
    results.push(await this.runCheck('memory', async () => {
      const memInfo = await this.gcp.sshCommand(
        "free | awk 'NR==2{printf \"%.0f\", $3*100/$2}'"
      ).catch(() => '100');
      const memPercent = parseInt(memInfo, 10);

      return {
        name: 'memory',
        category: this.category,
        status: memPercent < 80 ? 'pass' : memPercent < 90 ? 'warn' : 'fail',
        message: `Memory usage: ${memPercent}%`,
        timestamp: new Date(),
      };
    }));

    // Container Status
    results.push(await this.runCheck('n8n_container', async () => {
      const status = await this.gcp.sshCommand(
        "docker inspect -f '{{.State.Status}}' n8n 2>/dev/null || echo 'not found'"
      ).catch(() => 'error');

      return {
        name: 'n8n_container',
        category: this.category,
        status: status === 'running' ? 'pass' : 'fail',
        message: `n8n container: ${status}`,
        timestamp: new Date(),
      };
    }));

    return results;
  }
}

class SecurityVerifier extends BaseVerifier {
  readonly category = 'security';

  async verify(): Promise<CheckResult[]> {
    const results: CheckResult[] = [];

    // Encryption Key
    results.push(await this.runCheck('encryption_key', async () => {
      const key = await this.gcp.sshCommand(
        'grep N8N_ENCRYPTION_KEY /opt/n8n/docker-compose.yml 2>/dev/null | cut -d= -f2 | tr -d " "'
      ).catch(() => '');

      const isValid = /^[a-f0-9]{64}$/i.test(key);

      return {
        name: 'encryption_key',
        category: this.category,
        status: isValid ? 'pass' : 'fail',
        message: isValid ? 'Encryption key configured (64 hex chars)' : 'Invalid or missing encryption key',
        timestamp: new Date(),
      };
    }));

    // Basic Auth
    results.push(await this.runCheck('basic_auth', async () => {
      const authEnabled = await this.gcp.sshCommand(
        'grep -q "N8N_BASIC_AUTH_ACTIVE=true" /opt/n8n/docker-compose.yml 2>/dev/null && echo "yes" || echo "no"'
      ).catch(() => 'no');

      return {
        name: 'basic_auth',
        category: this.category,
        status: authEnabled === 'yes' ? 'pass' : 'fail',
        message: authEnabled === 'yes' ? 'Basic authentication enabled' : 'Basic authentication not enabled',
        timestamp: new Date(),
      };
    }));

    // Webhook HMAC Secret
    results.push(await this.runCheck('webhook_hmac_secret', async () => {
      const secretExists = await this.gcp.sshCommand(
        'gcloud secrets describe webhook-hmac-secret 2>/dev/null && echo "exists" || echo "missing"'
      ).catch(() => 'missing');

      return {
        name: 'webhook_hmac_secret',
        category: this.category,
        status: secretExists === 'exists' ? 'pass' : 'warn',
        message: secretExists === 'exists' ? 'Webhook HMAC secret configured' : 'Webhook HMAC secret not found',
        timestamp: new Date(),
      };
    }));

    return results;
  }
}

class DrVerifier extends BaseVerifier {
  readonly category = 'dr';

  async verify(): Promise<CheckResult[]> {
    const results: CheckResult[] = [];

    // Snapshot Schedule
    results.push(await this.runCheck('snapshot_schedule', async () => {
      const schedule = await this.gcp.sshCommand(
        'gcloud compute disks describe n8n-instance --zone=us-central1-a --format="value(resourcePolicies)" 2>/dev/null | grep -q snapshot && echo "yes" || echo "no"'
      ).catch(() => 'no');

      return {
        name: 'snapshot_schedule',
        category: this.category,
        status: schedule === 'yes' ? 'pass' : 'warn',
        message: schedule === 'yes' ? 'Snapshot schedule configured' : 'Snapshot schedule not configured',
        timestamp: new Date(),
      };
    }));

    // Backup Script
    results.push(await this.runCheck('backup_script', async () => {
      const scriptExists = await this.gcp.sshCommand(
        'test -f /opt/n8n/scripts/backup-database.sh && echo "yes" || echo "no"'
      ).catch(() => 'no');

      return {
        name: 'backup_script',
        category: this.category,
        status: scriptExists === 'yes' ? 'pass' : 'fail',
        message: scriptExists === 'yes' ? 'Backup script exists' : 'Backup script not found',
        timestamp: new Date(),
      };
    }));

    // Cron Job
    results.push(await this.runCheck('backup_cron', async () => {
      const cronJob = await this.gcp.sshCommand(
        'crontab -l 2>/dev/null | grep backup-database || echo "missing"'
      ).catch(() => 'missing');

      return {
        name: 'backup_cron',
        category: this.category,
        status: cronJob !== 'missing' ? 'pass' : 'fail',
        message: cronJob !== 'missing' ? 'Backup cron job configured' : 'Backup cron job not found',
        details: cronJob !== 'missing' ? { schedule: cronJob } : undefined,
        timestamp: new Date(),
      };
    }));

    // GCS Bucket
    results.push(await this.runCheck('gcs_bucket', async () => {
      const bucketExists = await this.gcp.checkGcsBucket('zaplit-n8n-backups');

      return {
        name: 'gcs_bucket',
        category: this.category,
        status: bucketExists ? 'pass' : 'warn',
        message: bucketExists ? 'GCS backup bucket exists' : 'GCS backup bucket not found',
        timestamp: new Date(),
      };
    }));

    // Docker Restart Policy
    results.push(await this.runCheck('docker_restart', async () => {
      const restartPolicy = await this.gcp.sshCommand(
        'grep restart /opt/n8n/docker-compose.yml | head -1'
      ).catch(() => '');

      const hasAlways = restartPolicy.includes('always');

      return {
        name: 'docker_restart',
        category: this.category,
        status: hasAlways ? 'pass' : 'warn',
        message: hasAlways ? 'Docker restart policy: always' : 'Docker restart policy not set to always',
        timestamp: new Date(),
      };
    }));

    return results;
  }
}

class MonitoringVerifier extends BaseVerifier {
  readonly category = 'monitoring';

  async verify(): Promise<CheckResult[]> {
    const results: CheckResult[] = [];

    // Prometheus Container
    results.push(await this.runCheck('prometheus', async () => {
      const status = await this.gcp.sshCommand(
        "docker inspect -f '{{.State.Status}}' prometheus 2>/dev/null || echo 'not found'"
      ).catch(() => 'error');

      return {
        name: 'prometheus',
        category: this.category,
        status: status === 'running' ? 'pass' : 'warn',
        message: `Prometheus container: ${status}`,
        timestamp: new Date(),
      };
    }));

    // Grafana Container
    results.push(await this.runCheck('grafana', async () => {
      const status = await this.gcp.sshCommand(
        "docker inspect -f '{{.State.Status}}' grafana 2>/dev/null || echo 'not found'"
      ).catch(() => 'error');

      return {
        name: 'grafana',
        category: this.category,
        status: status === 'running' ? 'pass' : 'warn',
        message: `Grafana container: ${status}`,
        timestamp: new Date(),
      };
    }));

    // Node Exporter
    results.push(await this.runCheck('node_exporter', async () => {
      const status = await this.gcp.sshCommand(
        "docker inspect -f '{{.State.Status}}' node-exporter 2>/dev/null || echo 'not found'"
      ).catch(() => 'error');

      return {
        name: 'node_exporter',
        category: this.category,
        status: status === 'running' ? 'pass' : 'warn',
        message: `Node exporter: ${status}`,
        timestamp: new Date(),
      };
    }));

    return results;
  }
}

class DataQualityVerifier extends BaseVerifier {
  readonly category = 'data_quality';

  async verify(): Promise<CheckResult[]> {
    const results: CheckResult[] = [];

    // n8n Health
    results.push(await this.runCheck('n8n_health', async () => {
      try {
        const response = await fetch(`${this.context.n8nUrl}/healthz`);
        return {
          name: 'n8n_health',
          category: this.category,
          status: response.status === 200 ? 'pass' : 'warn',
          message: `n8n health: HTTP ${response.status}`,
          timestamp: new Date(),
        };
      } catch {
        return {
          name: 'n8n_health',
          category: this.category,
          status: 'fail',
          message: 'n8n health check failed (connection error)',
          timestamp: new Date(),
        };
      }
    }));

    // Form API
    results.push(await this.runCheck('form_api', async () => {
      try {
        const response = await fetch(`${this.context.n8nUrl}/webhook/consultation-form`, {
          method: 'HEAD',
        });
        return {
          name: 'form_api',
          category: this.category,
          status: response.status === 200 || response.status === 401 ? 'pass' : 'warn',
          message: `Form API: HTTP ${response.status}`,
          timestamp: new Date(),
        };
      } catch {
        return {
          name: 'form_api',
          category: this.category,
          status: 'warn',
          message: 'Form API check failed',
          timestamp: new Date(),
        };
      }
    }));

    return results;
  }
}

// ============== Main Deployment Verifier ==============

class DeploymentVerifier {
  private verifiers: BaseVerifier[];
  private startTime: Date;

  constructor(private context: VerificationContext, private gcp: GcpClient) {
    this.startTime = new Date();
    this.verifiers = [
      new ConnectivityVerifier(gcp, context),
      new InfrastructureVerifier(gcp, context),
      new SecurityVerifier(gcp, context),
      new DrVerifier(gcp, context),
      new MonitoringVerifier(gcp, context),
      new DataQualityVerifier(gcp, context),
    ];
  }

  async verify(): Promise<VerificationReport> {
    console.log(chalk.bold.cyan('\n╔════════════════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold.cyan('║           Phase 1 Deployment Verification Script                   ║'));
    console.log(chalk.bold.cyan('║                Post-Deployment Health Check                        ║'));
    console.log(chalk.bold.cyan('╚════════════════════════════════════════════════════════════════════╝'));
    console.log(`Instance: ${this.context.instanceName}`);
    console.log(`Zone: ${this.context.zone}`);
    console.log(`Date: ${new Date().toISOString()}\n`);

    const allChecks: CheckResult[] = [];

    for (const verifier of this.verifiers) {
      const checks = await verifier.verify();
      allChecks.push(...checks);
    }

    return this.generateReport(allChecks);
  }

  private generateReport(checks: CheckResult[]): VerificationReport {
    const passed = checks.filter(c => c.status === 'pass').length;
    const failed = checks.filter(c => c.status === 'fail').length;
    const warnings = checks.filter(c => c.status === 'warn').length;
    const completedAt = new Date();

    return {
      summary: {
        passed,
        failed,
        warnings,
        total: checks.length,
      },
      checks,
      metadata: {
        instanceName: this.context.instanceName,
        zone: this.context.zone,
        projectId: this.context.projectId,
        startedAt: this.startTime,
        completedAt,
        duration: completedAt.getTime() - this.startTime.getTime(),
      },
    };
  }
}

// ============== CLI Entry Point ==============

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('verify-deployment')
    .description('Comprehensive post-deployment verification')
    .version('1.0.0')
    .option('-i, --instance <name>', 'Instance name', 'n8n-instance')
    .option('-z, --zone <zone>', 'GCP zone', 'us-central1-a')
    .option('-p, --project <project>', 'GCP project ID', 'zaplit-production')
    .option('-u, --n8n-url <url>', 'n8n URL', 'https://n8n.zaplit.com')
    .option('-c, --crm-url <url>', 'CRM URL', 'https://crm.zaplit.com')
    .option('-d, --detailed', 'Show detailed test output', false)
    .option('-j, --json', 'Output results as JSON', false)
    .option('-v, --verbose', 'Enable verbose logging', false)
    .parse();

  const options = program.opts<CLIOptions>();

  const context: VerificationContext = {
    instanceName: options.instance!,
    zone: options.zone!,
    projectId: options.project!,
    n8nUrl: options.n8nUrl!,
    crmUrl: options.crmUrl!,
  };

  const gcp = new GcpClient({
    projectId: context.projectId,
    zone: context.zone,
    instanceName: context.instanceName,
  });

  const verifier = new DeploymentVerifier(context, gcp);

  try {
    const report = await verifier.verify();

    const reporter = new ConsoleReporter({
      detailed: options.detailed!,
      json: options.json!,
      verbose: options.verbose!,
    });

    reporter.printVerificationReport(report);

    process.exit(report.summary.failed > 0 ? 1 : 0);
  } catch (error) {
    logger.error({ error }, 'Verification failed with error');
    console.error(chalk.red('Verification failed:'), error);
    process.exit(1);
  }
}

main();
