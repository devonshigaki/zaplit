#!/usr/bin/env ts-node
/**
 * Monitoring Infrastructure Deployment Script (TypeScript)
 * 
 * Deploys Prometheus + Grafana + Node Exporter for n8n observability
 * 
 * Usage: npx ts-node deploy-monitoring.ts [--auto-deploy]
 */

import { existsSync, mkdirSync, writeFileSync, chmodSync, copyFileSync } from 'fs';
import { dirname, join } from 'path';
import { execSync } from 'child_process';
import { Logger } from '../lib/logger';
import { CommandExecutor } from '../lib/exec';

interface MonitoringConfig {
  n8nDir: string;
  monitoringDir: string;
  grafanaAdminPassword?: string;
  autoDeploy: boolean;
}

interface PrometheusConfig {
  global: {
    scrape_interval: string;
    evaluation_interval: string;
    external_labels: Record<string, string>;
  };
  alerting: {
    alertmanagers: Array<{ static_configs: Array<{ targets: string[] }> }>;
  };
  rule_files: string[];
  scrape_configs: Array<{
    job_name: string;
    static_configs: Array<{ targets: string[] }>;
    metrics_path?: string;
    scrape_interval?: string;
    scrape_timeout?: string;
  }>;
}

interface AlertRule {
  alert: string;
  expr: string;
  for?: string;
  labels: Record<string, string>;
  annotations: {
    summary: string;
    description: string;
  };
}

interface AlertRuleGroup {
  name: string;
  interval?: string;
  rules: AlertRule[];
}

class MonitoringDeployment {
  private logger: Logger;
  private executor: CommandExecutor;
  private config: MonitoringConfig;

  constructor(config: Partial<MonitoringConfig> = {}) {
    this.config = {
      n8nDir: config.n8nDir || process.env.N8N_DIR || '/opt/n8n',
      monitoringDir: config.monitoringDir || join(config.n8nDir || '/opt/n8n', 'monitoring'),
      grafanaAdminPassword: config.grafanaAdminPassword || process.env.GRAFANA_ADMIN_PASSWORD,
      autoDeploy: config.autoDeploy || process.argv.includes('--auto-deploy'),
    };

    this.logger = new Logger();
    this.executor = new CommandExecutor(this.logger);
  }

  async run(): Promise<number> {
    this.printHeader();

    // Check prerequisites
    if (!this.checkPrerequisites()) {
      return 1;
    }

    // Setup directories
    this.setupDirectories();

    // Create configurations
    this.createPrometheusConfig();
    this.createAlertRules();
    this.createGrafanaProvisioning();

    // Setup Grafana password
    const password = this.setupGrafanaPassword();

    // Update docker-compose
    this.updateDockerCompose();

    // Deploy if requested
    if (this.config.autoDeploy || await this.askDeploy()) {
      await this.deployStack();
      this.printAccessInfo(password);
    } else {
      this.logger.info('Deployment skipped. Run "docker-compose up -d" manually to deploy.');
      this.printAccessInfo(password);
    }

    return 0;
  }

  private printHeader(): void {
    this.logger.header('n8n Monitoring Stack Deployment');
  }

  private checkPrerequisites(): boolean {
    this.logger.info('Checking prerequisites...');

    // Check n8n directory
    if (!existsSync(this.config.n8nDir)) {
      this.logger.error(`n8n directory not found at ${this.config.n8nDir}`);
      this.logger.info('Set N8N_DIR environment variable if different location');
      return false;
    }

    // Check docker-compose.yml
    const composeFile = join(this.config.n8nDir, 'docker-compose.yml');
    if (!existsSync(composeFile)) {
      this.logger.error(`docker-compose.yml not found in ${this.config.n8nDir}`);
      return false;
    }

    // Check Docker
    if (!this.executor.commandExists('docker')) {
      this.logger.error('Docker not found. Please install Docker first.');
      return false;
    }

    this.logger.success('Prerequisites check passed');
    return true;
  }

  private setupDirectories(): void {
    this.logger.info('Setting up monitoring directories...');

    const dirs = [
      this.config.monitoringDir,
      join(this.config.monitoringDir, 'grafana', 'dashboards'),
      join(this.config.monitoringDir, 'grafana', 'provisioning', 'datasources'),
      join(this.config.monitoringDir, 'grafana', 'provisioning', 'dashboards'),
    ];

    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    this.logger.success('Directories created');
  }

  private createPrometheusConfig(): void {
    this.logger.info('Creating Prometheus configuration...');

    const config: PrometheusConfig = {
      global: {
        scrape_interval: '15s',
        evaluation_interval: '15s',
        external_labels: {
          monitor: 'n8n-monitor',
          environment: 'production',
        },
      },
      alerting: {
        alertmanagers: [
          {
            static_configs: [{ targets: [] }],
          },
        ],
      },
      rule_files: ['alert-rules.yml'],
      scrape_configs: [
        {
          job_name: 'prometheus',
          static_configs: [{ targets: ['localhost:9090'] }],
          scrape_interval: '15s',
        },
        {
          job_name: 'n8n',
          static_configs: [{ targets: ['n8n:5678'] }],
          metrics_path: '/metrics',
          scrape_interval: '15s',
          scrape_timeout: '10s',
        },
        {
          job_name: 'node-exporter',
          static_configs: [{ targets: ['node-exporter:9100'] }],
          scrape_interval: '15s',
        },
      ],
    };

    const configPath = join(this.config.monitoringDir, 'prometheus.yml');
    writeFileSync(configPath, this.yamlStringify(config));
    this.logger.success('Prometheus configuration created');
  }

  private createAlertRules(): void {
    this.logger.info('Creating alert rules...');

    const alertGroups: AlertRuleGroup[] = [
      {
        name: 'n8n-critical',
        interval: '15s',
        rules: [
          {
            alert: 'N8nDown',
            expr: 'up{job="n8n"} == 0',
            for: '1m',
            labels: { severity: 'p0', service: 'n8n' },
            annotations: {
              summary: 'n8n is down',
              description: 'n8n instance has been down for more than 1 minute',
            },
          },
          {
            alert: 'HighErrorRate',
            expr: 'rate(n8n_execution_failed_total[5m]) > 0.1',
            for: '2m',
            labels: { severity: 'p0', service: 'n8n' },
            annotations: {
              summary: 'High error rate detected in n8n executions',
              description: 'Error rate is above 10% for more than 2 minutes',
            },
          },
          {
            alert: 'DiskSpaceLow',
            expr: '(node_filesystem_avail_bytes / node_filesystem_size_bytes) < 0.1',
            for: '5m',
            labels: { severity: 'p1', service: 'infrastructure' },
            annotations: {
              summary: 'Disk space below 10%',
              description: 'Filesystem has less than 10% space remaining',
            },
          },
          {
            alert: 'MemoryHigh',
            expr: '(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) > 0.85',
            for: '5m',
            labels: { severity: 'p1', service: 'infrastructure' },
            annotations: {
              summary: 'High memory usage',
              description: 'Memory usage is above 85% for more than 5 minutes',
            },
          },
          {
            alert: 'CPUHigh',
            expr: '100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80',
            for: '5m',
            labels: { severity: 'p1', service: 'infrastructure' },
            annotations: {
              summary: 'High CPU usage',
              description: 'CPU usage is above 80% for more than 5 minutes',
            },
          },
        ],
      },
      {
        name: 'n8n-warnings',
        interval: '30s',
        rules: [
          {
            alert: 'PrometheusTargetMissing',
            expr: 'up == 0',
            for: '5m',
            labels: { severity: 'p2', service: 'monitoring' },
            annotations: {
              summary: 'Prometheus target is missing',
              description: 'Target has been down for more than 5 minutes',
            },
          },
        ],
      },
    ];

    const rulesPath = join(this.config.monitoringDir, 'alert-rules.yml');
    writeFileSync(rulesPath, this.yamlStringify({ groups: alertGroups }));
    this.logger.success('Alert rules created');
  }

  private createGrafanaProvisioning(): void {
    this.logger.info('Creating Grafana provisioning configuration...');

    // Datasource provisioning
    const datasourceConfig = {
      apiVersion: 1,
      datasources: [
        {
          name: 'Prometheus',
          type: 'prometheus',
          access: 'proxy',
          url: 'http://prometheus:9090',
          isDefault: true,
          editable: false,
        },
      ],
    };

    const dsPath = join(this.config.monitoringDir, 'grafana', 'provisioning', 'datasources', 'prometheus.yml');
    writeFileSync(dsPath, this.yamlStringify(datasourceConfig));

    // Dashboard provisioning
    const dashboardConfig = {
      apiVersion: 1,
      providers: [
        {
          name: 'default',
          orgId: 1,
          folder: '',
          type: 'file',
          disableDeletion: false,
          editable: true,
          options: {
            path: '/etc/grafana/provisioning/dashboards',
          },
        },
      ],
    };

    const dbPath = join(this.config.monitoringDir, 'grafana', 'provisioning', 'dashboards', 'dashboards.yml');
    writeFileSync(dbPath, this.yamlStringify(dashboardConfig));

    this.logger.success('Grafana provisioning created');
  }

  private setupGrafanaPassword(): string {
    let password = this.config.grafanaAdminPassword;

    if (!password) {
      password = this.generatePassword();
      this.logger.warn(`Generated Grafana admin password (save this!): ${password}`);
    }

    // Save password to file with restricted permissions
    const passwordFile = join(this.config.monitoringDir, '.grafana-admin-password');
    writeFileSync(passwordFile, password);
    try {
      chmodSync(passwordFile, 0o600);
    } catch {
      // Ignore chmod errors on Windows
    }

    this.logger.info(`Grafana admin password saved to ${passwordFile}`);
    return password;
  }

  private updateDockerCompose(): void {
    this.logger.info('Updating docker-compose.yml...');

    const composeFile = join(this.config.n8nDir, 'docker-compose.yml');

    // Check if monitoring services already exist
    const content = execSync(`cat "${composeFile}"`, { encoding: 'utf-8' });
    if (content.includes('prometheus:')) {
      this.logger.warn('Monitoring services already in docker-compose.yml');
      return;
    }

    // Backup original
    const backupFile = `${composeFile}.backup.${this.formatDate(new Date())}`;
    copyFileSync(composeFile, backupFile);

    // Append monitoring services
    const monitoringServices = `
  # Monitoring Stack
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./monitoring/alert-rules.yml:/etc/prometheus/alert-rules.yml:ro
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=15d'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
      - '--web.enable-lifecycle'
    ports:
      - "9090:9090"
    restart: unless-stopped
    networks:
      - n8n-network

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    volumes:
      - grafana_data:/var/lib/grafana
      - ./monitoring/grafana/provisioning:/etc/grafana/provisioning:ro
      - ./monitoring/grafana/dashboards:/etc/grafana/provisioning/dashboards:ro
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${this.config.grafanaAdminPassword}
      - GF_USERS_ALLOW_SIGN_UP=false
      - GF_SERVER_ROOT_URL=http://localhost:3000
    restart: unless-stopped
    networks:
      - n8n-network
    depends_on:
      - prometheus

  node-exporter:
    image: prom/node-exporter:latest
    container_name: node-exporter
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.rootfs=/rootfs'
      - '--path.sysfs=/host/sys'
      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
    restart: unless-stopped
    networks:
      - n8n-network

volumes:
  prometheus_data:
  grafana_data:
`;

    writeFileSync(composeFile, content + monitoringServices);
    this.logger.success('docker-compose.yml updated with monitoring services');
  }

  private async deployStack(): Promise<void> {
    this.logger.info('Deploying monitoring stack...');

    process.chdir(this.config.n8nDir);

    // Pull latest images
    this.logger.info('Pulling latest images...');
    execSync('docker-compose pull prometheus grafana node-exporter', { stdio: 'inherit' });

    // Start monitoring services
    this.logger.info('Starting monitoring services...');
    execSync('docker-compose up -d prometheus grafana node-exporter', { stdio: 'inherit' });

    // Wait for services
    this.logger.info('Waiting for services to be ready...');
    await this.sleep(10000);

    // Check service health
    this.checkServiceHealth();
  }

  private checkServiceHealth(): void {
    try {
      const psOutput = execSync('docker-compose ps', { encoding: 'utf-8' });

      if (psOutput.includes('prometheus') && psOutput.includes('Up')) {
        this.logger.success('Prometheus is running on port 9090');
      } else {
        this.logger.error('Prometheus failed to start');
      }

      if (psOutput.includes('grafana') && psOutput.includes('Up')) {
        this.logger.success('Grafana is running on port 3000');
      } else {
        this.logger.error('Grafana failed to start');
      }

      if (psOutput.includes('node-exporter') && psOutput.includes('Up')) {
        this.logger.success('Node Exporter is running');
      } else {
        this.logger.error('Node Exporter failed to start');
      }
    } catch {
      this.logger.warn('Could not check service health');
    }
  }

  private async askDeploy(): Promise<boolean> {
    // In non-interactive mode, don't deploy
    if (!process.stdin.isTTY) {
      return false;
    }

    // For this implementation, we'll use a simple prompt
    // In production, you might want to use a library like 'enquirer' or 'inquirer'
    return new Promise((resolve) => {
      process.stdout.write('Deploy monitoring stack now? (y/N): ');
      process.stdin.once('data', (data) => {
        const answer = data.toString().trim().toLowerCase();
        resolve(answer === 'y' || answer === 'yes');
      });
    });
  }

  private printAccessInfo(password: string): void {
    let serverIp: string;
    try {
      serverIp = execSync('hostname -I | awk \'{print $1}\'', { encoding: 'utf-8' }).trim();
    } catch {
      serverIp = 'localhost';
    }

    console.log();
    console.log('='.repeat(42));
    console.log('  Monitoring Stack Deployed Successfully!');
    console.log('='.repeat(42));
    console.log();
    console.log('Prometheus:');
    console.log(`  URL: http://${serverIp}:9090`);
    console.log(`  Status: http://${serverIp}:9090/targets`);
    console.log(`  Alerts: http://${serverIp}:9090/alerts`);
    console.log();
    console.log('Grafana:');
    console.log(`  URL: http://${serverIp}:3000`);
    console.log('  Username: admin');
    console.log(`  Password: ${password}`);
    console.log(`  (Saved in: ${join(this.config.monitoringDir, '.grafana-admin-password')})`);
    console.log();
    console.log('IMPORTANT: Secure your Grafana installation!');
    console.log('  - Change default admin password');
    console.log('  - Consider enabling HTTPS/SSL');
    console.log('  - Restrict port access with firewall');
    console.log();
    console.log('='.repeat(42));
  }

  private generatePassword(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let password = '';
    for (let i = 0; i < 16; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  private formatDate(date: Date): string {
    return date.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private yamlStringify(obj: any, indent: number = 0): string {
    const spaces = '  '.repeat(indent);
    let result = '';

    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        continue;
      }

      if (Array.isArray(value)) {
        if (value.length === 0) {
          result += `${spaces}${key}: []\n`;
        } else if (typeof value[0] === 'object') {
          result += `${spaces}${key}:\n`;
          for (const item of value) {
            const itemYaml = this.yamlStringify(item, indent + 1);
            result += `${spaces}- ${itemYaml.trim().replace(/\n/g, `\n${spaces}  `)}\n`;
          }
        } else {
          result += `${spaces}${key}:\n`;
          for (const item of value) {
            result += `${spaces}- ${item}\n`;
          }
        }
      } else if (typeof value === 'object') {
        result += `${spaces}${key}:\n`;
        result += this.yamlStringify(value, indent + 1);
      } else {
        result += `${spaces}${key}: ${value}\n`;
      }
    }

    return result;
  }
}

// Main execution
const main = async (): Promise<void> => {
  const deployment = new MonitoringDeployment();
  const exitCode = await deployment.run();
  process.exit(exitCode);
};

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
