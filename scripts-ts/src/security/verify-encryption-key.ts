#!/usr/bin/env ts-node
/**
 * N8N Encryption Key Verification Script (TypeScript)
 * 
 * Verifies n8n security configuration including:
 * - Encryption key presence and strength
 * - Basic authentication configuration
 * - Webhook HMAC secret
 * 
 * Usage: npx ts-node verify-encryption-key.ts [INSTANCE_NAME] [ZONE] [PROJECT_ID]
 */

import { Logger } from '../lib/logger.js';
import { GCloudClient, createGCloudClient } from '../lib/gcloud.js';

interface VerificationConfig {
  instanceName: string;
  zone: string;
  projectId: string;
}

interface VerificationResult {
  encryptionKey: boolean;
  basicAuth: boolean;
  hmacSecret: boolean;
  errors: string[];
  warnings: string[];
}

const WEAK_KEYS = ['n8n', 'password', 'secret', 'admin', '123456', 'default', 'change-me', ''];

class EncryptionKeyVerifier {
  private logger: Logger;
  private gcloud: GCloudClient;
  private config: VerificationConfig;

  constructor(config: VerificationConfig) {
    this.config = config;
    this.logger = new Logger();
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

    // Check instance exists
    if (!this.checkInstance()) {
      return 1;
    }

    // Run verifications
    const result: VerificationResult = {
      encryptionKey: false,
      basicAuth: false,
      hmacSecret: false,
      errors: [],
      warnings: [],
    };

    // Check container status
    const containerStatus = this.checkContainerStatus();
    if (!containerStatus.running) {
      this.logger.error('n8n container is not running');
      return 1;
    }
    this.logger.success(`n8n container is running: ${containerStatus.status}`);

    // Verify encryption key
    const keyResult = this.verifyEncryptionKey();
    result.encryptionKey = keyResult.valid;
    result.errors.push(...keyResult.errors);
    result.warnings.push(...keyResult.warnings);

    // Verify basic auth
    const authResult = this.verifyBasicAuth();
    result.basicAuth = authResult.enabled;
    result.errors.push(...authResult.errors);
    result.warnings.push(...authResult.warnings);

    // Verify HMAC secret
    const hmacResult = this.verifyHmacSecret();
    result.hmacSecret = hmacResult.configured;
    result.warnings.push(...hmacResult.warnings);

    // Print summary
    this.printSummary(result);

    return result.errors.length > 0 ? Math.min(result.errors.length, 3) : 0;
  }

  private printHeader(): void {
    this.logger.header('n8n Encryption Key Verification Tool', {
      Instance: this.config.instanceName,
      Zone: this.config.zone,
      Project: this.config.projectId,
    });
  }

  private checkPrerequisites(): boolean {
    // Check gcloud installed
    if (!this.gcloud.checkInstalled()) {
      this.logger.error('gcloud CLI is not installed');
      console.log('Install from: https://cloud.google.com/sdk/docs/install');
      return false;
    }

    // Check authentication
    if (!this.gcloud.checkAuthenticated()) {
      this.logger.error('Not authenticated with gcloud');
      console.log('Run: gcloud auth login');
      return false;
    }

    this.logger.info('Authenticated with gcloud');
    return true;
  }

  private checkInstance(): boolean {
    this.logger.info('Checking if instance exists...');
    
    if (!this.gcloud.instanceExists(this.config.instanceName, this.config.zone)) {
      this.logger.error(`Instance '${this.config.instanceName}' not found in zone '${this.config.zone}'`);
      return false;
    }

    this.logger.success('Instance found');
    return true;
  }

  private checkContainerStatus(): { running: boolean; status: string } {
    this.logger.info('Checking n8n container status...');
    
    const result = this.gcloud.ssh(
      this.config.instanceName,
      "docker ps --filter 'name=n8n' --format '{{.Status}}'",
      this.config.zone
    );

    return {
      running: result.success && result.stdout.trim().length > 0,
      status: result.stdout.trim(),
    };
  }

  private verifyEncryptionKey(): { valid: boolean; errors: string[]; warnings: string[] } {
    this.logger.info('Checking N8N_ENCRYPTION_KEY...');
    
    const result = this.gcloud.ssh(
      this.config.instanceName,
      'docker exec n8n printenv N8N_ENCRYPTION_KEY',
      this.config.zone
    );

    const key = result.success ? result.stdout.trim() : '';
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!key) {
      errors.push('N8N_ENCRYPTION_KEY is NOT SET');
      this.printEncryptionKeyWarning();
      return { valid: false, errors, warnings };
    }

    // Check key length
    if (key.length < 32) {
      errors.push(`Encryption key is too short (${key.length} chars). Minimum 32 characters required.`);
      return { valid: false, errors, warnings };
    }

    this.logger.success(`N8N_ENCRYPTION_KEY is set (length: ${key.length} chars)`);

    // Check key format
    if (/^[a-f0-9]{64}$/i.test(key)) {
      this.logger.success('Key format appears valid (64 hex characters)');
    } else if (/^[a-f0-9]{32}$/i.test(key)) {
      warnings.push('Key is 32 hex characters (128-bit). Consider using 64 hex characters (256-bit) for stronger security');
      this.logger.warn(warnings[warnings.length - 1]);
    } else {
      warnings.push('Key format is non-standard. May be a passphrase instead of hex key');
      this.logger.warn(warnings[warnings.length - 1]);
    }

    // Check for weak keys
    for (const weak of WEAK_KEYS) {
      if (key.toLowerCase() === weak.toLowerCase()) {
        errors.push(`Encryption key appears to be a weak/default value: '${weak}'`);
        this.logger.error(errors[errors.length - 1]);
        this.logger.warn('Generate a new secure key with: openssl rand -hex 32');
        return { valid: false, errors, warnings };
      }
    }

    return { valid: true, errors, warnings };
  }

  private verifyBasicAuth(): { enabled: boolean; errors: string[]; warnings: string[] } {
    this.logger.info('Checking Basic Authentication configuration...');
    
    const result = this.gcloud.ssh(
      this.config.instanceName,
      'docker exec n8n printenv N8N_BASIC_AUTH_ACTIVE',
      this.config.zone
    );

    const authActive = result.success ? result.stdout.trim() : '';
    const errors: string[] = [];
    const warnings: string[] = [];

    if (authActive !== 'true') {
      errors.push('Basic Authentication is NOT enabled');
      this.printBasicAuthWarning();
      return { enabled: false, errors, warnings };
    }

    this.logger.success('Basic Authentication is ENABLED');

    // Check username
    const userResult = this.gcloud.ssh(
      this.config.instanceName,
      'docker exec n8n printenv N8N_BASIC_AUTH_USER',
      this.config.zone
    );

    const username = userResult.success ? userResult.stdout.trim() : '';
    if (username) {
      this.logger.success(`Basic Auth User: ${username}`);
    } else {
      warnings.push('Basic Auth user not set');
      this.logger.warn(warnings[warnings.length - 1]);
    }

    return { enabled: true, errors, warnings };
  }

  private verifyHmacSecret(): { configured: boolean; warnings: string[] } {
    this.logger.info('Checking Webhook HMAC configuration...');
    
    const result = this.gcloud.ssh(
      this.config.instanceName,
      'docker exec n8n printenv WEBHOOK_HMAC_SECRET',
      this.config.zone
    );

    const secret = result.success ? result.stdout.trim() : '';
    const warnings: string[] = [];

    if (secret) {
      this.logger.success('Webhook HMAC secret is configured');
      return { configured: true, warnings };
    } else {
      warnings.push('Webhook HMAC secret not found in environment variables');
      this.logger.warn(warnings[warnings.length - 1]);
      this.logger.info('Ensure HMAC verification is implemented in workflow logic');
      return { configured: false, warnings };
    }
  }

  private printEncryptionKeyWarning(): void {
    this.logger.warningBox(
      'CRITICAL SECURITY ISSUE: Encryption key is missing!',
      [
        'This means:',
        '• Credentials are stored unencrypted',
        '• Any data breach exposes all saved credentials',
        '• Compliance violations (SOC2, GDPR, etc.)',
      ]
    );

    this.logger.warn('Run the following to generate and set a new encryption key:');
    console.log();
    console.log('  # Generate new key');
    console.log('  NEW_KEY=$(openssl rand -hex 32)');
    console.log('  echo "Generated key: $NEW_KEY"');
    console.log();
    console.log('  # SSH to instance and update docker-compose.yml');
    console.log(`  gcloud compute ssh ${this.config.instanceName} --zone=${this.config.zone}`);
    console.log();
    console.log('  # Add to docker-compose.yml environment section:');
    console.log('  environment:');
    console.log('    - N8N_ENCRYPTION_KEY=$NEW_KEY');
    console.log();
    console.log('  # Restart n8n');
    console.log('  cd /opt/n8n && docker-compose down && docker-compose up -d');
    console.log();
    this.logger.warn('⚠️  WARNING: After setting encryption key, ALL credentials must be re-entered!');
  }

  private printBasicAuthWarning(): void {
    this.logger.warningBox(
      'CRITICAL SECURITY ISSUE: Basic Authentication is disabled!',
      [
        'This means:',
        '• Anyone can access the n8n editor',
        '• Workflows can be viewed/modified by unauthorized users',
        '• Webhooks can be triggered by anyone',
      ]
    );

    this.logger.warn('Run ./enable-basic-auth.sh to enable basic authentication');
  }

  private printSummary(result: VerificationResult): void {
    this.logger.summary('Verification Summary', [
      { label: 'Encryption Key', status: result.encryptionKey ? 'success' : 'error', message: result.encryptionKey ? 'CONFIGURED' : 'NOT CONFIGURED' },
      { label: 'Basic Auth', status: result.basicAuth ? 'success' : 'error', message: result.basicAuth ? 'ENABLED' : 'DISABLED' },
      { label: 'HMAC Secret', status: result.hmacSecret ? 'success' : 'warn', message: result.hmacSecret ? 'CONFIGURED' : 'NOT CONFIGURED (manual workflow verification required)' },
    ]);

    if (result.errors.length === 0) {
      this.logger.info('Security checks complete!');
      this.logger.info('Instance: https://n8n.zaplit.com');
    }
  }
}

// Main execution
const main = async (): Promise<void> => {
  const instanceName = process.argv[2] || 'n8n-instance';
  const zone = process.argv[3] || 'us-central1-a';
  const projectId = process.argv[4] || process.env.GCP_PROJECT_ID || 'zaplit-production';

  const verifier = new EncryptionKeyVerifier({ instanceName, zone, projectId });
  const exitCode = await verifier.run();
  process.exit(exitCode);
};

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
