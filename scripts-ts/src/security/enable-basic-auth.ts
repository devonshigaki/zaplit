#!/usr/bin/env ts-node
/**
 * N8N Basic Authentication Setup Script (TypeScript)
 * 
 * Enables basic authentication for n8n and stores password in GCP Secret Manager
 * 
 * Usage: npx ts-node enable-basic-auth.ts [INSTANCE_NAME] [ZONE] [USERNAME] [PROJECT_ID]
 */

import { Logger } from '../lib/logger.js';
import { GCloudClient, createGCloudClient } from '../lib/gcloud.js';
import { CommandExecutor } from '../lib/exec.js';

interface BasicAuthConfig {
  instanceName: string;
  zone: string;
  username: string;
  projectId: string;
}

interface DockerComposeEnv {
  N8N_BASIC_AUTH_ACTIVE: string;
  N8N_BASIC_AUTH_USER: string;
  N8N_BASIC_AUTH_PASSWORD: string;
  N8N_ENCRYPTION_KEY?: string;
  WEBHOOK_URL?: string;
  N8N_HOST?: string;
}

class BasicAuthSetup {
  private logger: Logger;
  private gcloud: GCloudClient;
  private executor: CommandExecutor;
  private config: BasicAuthConfig;
  private composeFile = '/opt/n8n/docker-compose.yml';
  private backupDir = '/opt/n8n/backups';
  private secretName = 'n8n-admin-password';
  private backupFile: string = '';

  constructor(config: BasicAuthConfig) {
    this.config = config;
    this.logger = new Logger();
    this.executor = new CommandExecutor(this.logger);
    this.gcloud = createGCloudClient({
      projectId: config.projectId,
      zone: config.zone,
    });
  }

  async run(): Promise<number> {
    this.printHeader();

    // Pre-flight checks
    if (!this.checkPrerequisites()) {
      return 1;
    }

    // Set project
    this.gcloud.setProject();

    // Generate password
    const password = await this.generateAndStorePassword();
    if (!password) {
      return 1;
    }

    // Setup directories on VM
    this.setupDirectories();

    // Check docker-compose exists
    if (!this.checkDockerCompose()) {
      return 1;
    }

    // Create backup
    if (!this.createBackup()) {
      return 1;
    }

    // Check current auth status
    const currentAuth = this.getCurrentAuthStatus();
    if (currentAuth) {
      this.logger.warn('Basic auth already enabled');
      if (!await this.askProceed()) {
        this.logger.info('Aborted by user');
        return 0;
      }
    }

    // Update docker-compose
    if (!this.updateDockerCompose(password)) {
      this.logger.error('Failed to update docker-compose.yml');
      this.restoreBackup();
      return 1;
    }

    // Restart n8n
    if (!await this.askRestart()) {
      this.logger.info('Changes saved but not applied.');
      this.logger.info('To apply manually, SSH to instance and run:');
      console.log('  cd /opt/n8n && docker-compose down && docker-compose up -d');
      this.printSummary(password);
      return 0;
    }

    if (!this.restartN8n()) {
      this.logger.error('Failed to restart n8n');
      this.restoreBackup();
      return 1;
    }

    this.logger.success('n8n restarted successfully');

    // Wait and verify
    this.logger.info('Waiting for n8n to be ready (30 seconds)...');
    await this.sleep(30000);
    this.verifyBasicAuth();

    this.printSummary(password);
    return 0;
  }

  private printHeader(): void {
    this.logger.header('n8n Basic Authentication Setup', {
      Instance: this.config.instanceName,
      Zone: this.config.zone,
      Username: this.config.username,
      Project: this.config.projectId,
    });
  }

  private checkPrerequisites(): boolean {
    this.logger.info('Performing pre-flight checks...');

    // Check gcloud
    if (!this.gcloud.checkInstalled()) {
      this.logger.error('gcloud CLI is not installed');
      return false;
    }

    // Check authentication
    if (!this.gcloud.checkAuthenticated()) {
      this.logger.error('Not authenticated with gcloud. Run: gcloud auth login');
      return false;
    }

    this.logger.success('gcloud authenticated');

    // Check instance exists
    if (!this.gcloud.instanceExists(this.config.instanceName, this.config.zone)) {
      this.logger.error(`Instance '${this.config.instanceName}' not found in zone '${this.config.zone}'`);
      return false;
    }

    this.logger.success('Instance exists');
    return true;
  }

  private async generateAndStorePassword(): Promise<string | null> {
    this.logger.info('Generating secure password...');
    const password = this.generatePassword();
    this.logger.success(`Password generated (length: ${password.length} chars)`);

    // Store in GCP Secret Manager
    this.logger.info('Storing password in GCP Secret Manager...');

    const exists = this.gcloud.secretExists(this.secretName);
    
    if (exists) {
      this.logger.warn(`Secret '${this.secretName}' already exists`);
      if (await this.askUpdateSecret()) {
        if (this.gcloud.createSecret(this.secretName, password, { service: 'n8n', env: 'production' })) {
          this.logger.success('Secret updated in GCP Secret Manager');
          return password;
        }
      } else {
        this.logger.info('Using existing secret');
        return this.gcloud.getSecret(this.secretName);
      }
    } else {
      if (this.gcloud.createSecret(this.secretName, password, { service: 'n8n', env: 'production' })) {
        this.logger.success('Secret created in GCP Secret Manager');
        return password;
      }
    }

    this.logger.error('Failed to store password in Secret Manager');
    return null;
  }

  private setupDirectories(): void {
    this.gcloud.ssh(
      this.config.instanceName,
      `sudo mkdir -p ${this.backupDir} && sudo chmod 700 ${this.backupDir}`,
      this.config.zone
    );
  }

  private checkDockerCompose(): boolean {
    const result = this.gcloud.ssh(
      this.config.instanceName,
      `[ -f ${this.composeFile} ] && echo "exists" || echo "missing"`,
      this.config.zone
    );

    if (!result.success || !result.stdout.includes('exists')) {
      this.logger.error(`docker-compose.yml not found at ${this.composeFile}`);
      return false;
    }

    return true;
  }

  private createBackup(): boolean {
    this.backupFile = `${this.backupDir}/docker-compose.yml.backup.${this.formatDate(new Date())}`;
    this.logger.info(`Creating backup: ${this.backupFile}`);

    const result = this.gcloud.ssh(
      this.config.instanceName,
      `sudo cp ${this.composeFile} ${this.backupFile} && sudo chmod 600 ${this.backupFile}`,
      this.config.zone
    );

    if (result.success) {
      this.logger.success('Backup created');
      return true;
    } else {
      this.logger.error('Failed to create backup');
      return false;
    }
  }

  private getCurrentAuthStatus(): boolean {
    const result = this.gcloud.ssh(
      this.config.instanceName,
      `sudo grep -o 'N8N_BASIC_AUTH_ACTIVE=.*' ${this.composeFile} | cut -d= -f2`,
      this.config.zone
    );

    return result.success && result.stdout.trim() === 'true';
  }

  private updateDockerCompose(password: string): boolean {
    this.logger.info('Preparing docker-compose update...');

    // Read current encryption key if exists
    const encResult = this.gcloud.ssh(
      this.config.instanceName,
      `grep 'N8N_ENCRYPTION_KEY=' ${this.composeFile} | cut -d= -f2 || echo ''`,
      this.config.zone
    );
    const encryptionKey = encResult.stdout.trim();

    // Build environment section
    const envSection = `  n8n:
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=${this.config.username}
      - N8N_BASIC_AUTH_PASSWORD=${password}
      ${encryptionKey ? `- N8N_ENCRYPTION_KEY=${encryptionKey}` : ''}
      - WEBHOOK_URL=https://n8n.zaplit.com/
      - N8N_HOST=n8n.zaplit.com
`;

    // Apply the update via SSH
    const script = `
# Check if environment section exists
if sudo grep -q 'environment:' ${this.composeFile}; then
    # Update existing environment section
    echo 'Updating existing environment section...'
    
    # Use sed to update or add basic auth vars
    sudo sed -i 's/N8N_BASIC_AUTH_ACTIVE=.*/N8N_BASIC_AUTH_ACTIVE=true/' ${this.composeFile} 2>/dev/null || true
    
    if ! sudo grep -q 'N8N_BASIC_AUTH_USER=' ${this.composeFile}; then
        sudo sed -i '/environment:/a\\      - N8N_BASIC_AUTH_USER=${this.config.username}' ${this.composeFile}
    else
        sudo sed -i "s/N8N_BASIC_AUTH_USER=.*/N8N_BASIC_AUTH_USER=${this.config.username}/" ${this.composeFile}
    fi
    
    if ! sudo grep -q 'N8N_BASIC_AUTH_PASSWORD=' ${this.composeFile}; then
        sudo sed -i '/N8N_BASIC_AUTH_USER=/a\\      - N8N_BASIC_AUTH_PASSWORD=${password}' ${this.composeFile}
    else
        sudo sed -i "s/N8N_BASIC_AUTH_PASSWORD=.*/N8N_BASIC_AUTH_PASSWORD=${password}/" ${this.composeFile}
    fi
else
    # Add new environment section to n8n service
    echo 'Adding new environment section...'
    sudo sed -i '/^  n8n:/,/^  [a-z]/ { /^  [a-z]/i\\    environment:\\n      - N8N_BASIC_AUTH_ACTIVE=true\\n      - N8N_BASIC_AUTH_USER=${this.config.username}\\n      - N8N_BASIC_AUTH_PASSWORD=${password}
    }' ${this.composeFile}
fi

# Verify the changes
if sudo grep -q 'N8N_BASIC_AUTH_ACTIVE=true' ${this.composeFile}; then
    echo 'SUCCESS: Basic auth configuration added'
else
    echo 'WARNING: Could not verify configuration change'
fi
`;

    const result = this.gcloud.ssh(
      this.config.instanceName,
      script,
      this.config.zone
    );

    if (result.success) {
      this.logger.success('docker-compose.yml updated');
      return true;
    } else {
      return false;
    }
  }

  private restartN8n(): boolean {
    this.logger.info('Restarting n8n container...');
    const result = this.gcloud.ssh(
      this.config.instanceName,
      'cd /opt/n8n && sudo docker-compose down && sudo docker-compose up -d',
      this.config.zone
    );
    return result.success;
  }

  private restoreBackup(): void {
    this.logger.info('Restoring from backup...');
    this.gcloud.ssh(
      this.config.instanceName,
      `sudo cp ${this.backupFile} ${this.composeFile} && cd /opt/n8n && sudo docker-compose down && sudo docker-compose up -d`,
      this.config.zone
    );
  }

  private verifyBasicAuth(): void {
    this.logger.info('Verifying basic authentication...');

    try {
      const result = this.executor.execSilent(
        `curl -s -o /dev/null -w "%{http_code}" https://n8n.zaplit.com/ 2>/dev/null || echo "000"`
      );

      if (result === '401') {
        this.logger.success('Basic Authentication is active (401 response without credentials)');
      } else if (result === '200') {
        this.logger.warn('Basic Authentication may not be active (200 response)');
      } else {
        this.logger.warn(`Could not verify basic auth status (HTTP ${result})`);
      }
    } catch {
      this.logger.warn('Could not verify basic auth status');
    }
  }

  private printSummary(password: string): void {
    console.log();
    console.log('='.repeat(42));
    console.log('  Setup Complete!');
    console.log('='.repeat(42));
    this.logger.success('Basic Authentication enabled');
    console.log();
    console.log('Access Details:');
    console.log('  URL:      https://n8n.zaplit.com');
    console.log(`  Username: ${this.config.username}`);
    console.log(`  Password: [Stored in GCP Secret Manager: ${this.secretName}]`);
    console.log();
    console.log('To retrieve password:');
    console.log(`  gcloud secrets versions access latest --secret=${this.secretName}`);
    console.log();
    this.logger.warn('IMPORTANT: Save these credentials securely!');
    console.log();
    console.log('Test login with:');
    console.log(`  curl -u ${this.config.username}:${password.substring(0, 10)}... https://n8n.zaplit.com/`);
    console.log();
  }

  private generatePassword(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 32; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  private formatDate(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }

  private async askProceed(): Promise<boolean> {
    return this.askYesNo('Proceed with update? (y/N): ');
  }

  private async askUpdateSecret(): Promise<boolean> {
    return this.askYesNo('Update existing secret? (y/N): ');
  }

  private async askRestart(): Promise<boolean> {
    return this.askYesNo('Continue with restart? (y/N): ');
  }

  private async askYesNo(prompt: string): Promise<boolean> {
    if (!process.stdin.isTTY) {
      return false;
    }

    process.stdout.write(prompt);
    return new Promise((resolve) => {
      process.stdin.once('data', (data) => {
        const answer = data.toString().trim().toLowerCase();
        resolve(answer === 'y' || answer === 'yes');
      });
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Main execution
const main = async (): Promise<void> => {
  const instanceName = process.argv[2] || 'n8n-instance';
  const zone = process.argv[3] || 'us-central1-a';
  const username = process.argv[4] || 'zaplit-admin';
  const projectId = process.argv[5] || process.env.GCP_PROJECT_ID || 'zaplit-production';

  const setup = new BasicAuthSetup({ instanceName, zone, username, projectId });
  const exitCode = await setup.run();
  process.exit(exitCode);
};

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
