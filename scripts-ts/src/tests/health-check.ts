#!/usr/bin/env ts-node
/**
 * Health Check Script for n8n-Twenty CRM Integration (TypeScript)
 * 
 * Performs health checks on n8n, Twenty CRM, and webhook endpoints
 * 
 * Usage: npx ts-node health-check.ts
 */

import { Logger } from '../lib/logger';
import { CommandExecutor } from '../lib/exec';

interface HealthCheckConfig {
  n8nUrl: string;
  twentyUrl: string;
  webhookPath: string;
}

interface HealthResult {
  name: string;
  status: 'healthy' | 'unhealthy';
  httpCode: string;
  details?: string;
}

class HealthChecker {
  private logger: Logger;
  private executor: CommandExecutor;
  private config: HealthCheckConfig;

  constructor(config: Partial<HealthCheckConfig> = {}) {
    this.config = {
      n8nUrl: config.n8nUrl || process.env.N8N_URL || 'https://n8n.zaplit.com',
      twentyUrl: config.twentyUrl || process.env.TWENTY_URL || 'https://crm.zaplit.com',
      webhookPath: config.webhookPath || process.env.WEBHOOK_PATH || '/webhook/consultation',
    };

    this.logger = new Logger();
    this.executor = new CommandExecutor(this.logger);
  }

  async run(): Promise<number> {
    this.printHeader();

    const results: HealthResult[] = [];

    // Check 1: n8n Health
    results.push(await this.checkN8nHealth());

    // Check 2: Twenty CRM Health
    results.push(await this.checkTwentyHealth());

    // Check 3: Webhook Endpoint
    results.push(await this.checkWebhookEndpoint());

    // Check 4: Test Submission
    results.push(await this.checkTestSubmission());

    // Print summary
    this.printSummary(results);

    return results.some(r => r.status === 'unhealthy') ? 1 : 0;
  }

  private printHeader(): void {
    this.logger.header('Health Check: n8n-Twenty CRM Integration');
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log();
  }

  private async checkN8nHealth(): Promise<HealthResult> {
    process.stdout.write('1. n8n instance health: ');

    const httpCode = this.executor.execSilent(
      `curl -s -o /dev/null -w "%{http_code}" "${this.config.n8nUrl}/healthz" 2>/dev/null || echo "000"`
    );

    if (httpCode === '200') {
      this.logger.success('✓ Healthy (HTTP 200)');
      return { name: 'n8n Health', status: 'healthy', httpCode };
    } else {
      this.logger.error(`✗ Unhealthy (HTTP ${httpCode})`);
      return { name: 'n8n Health', status: 'unhealthy', httpCode };
    }
  }

  private async checkTwentyHealth(): Promise<HealthResult> {
    process.stdout.write('2. Twenty CRM health:   ');

    const httpCode = this.executor.execSilent(
      `curl -s -o /dev/null -w "%{http_code}" "${this.config.twentyUrl}/healthz" 2>/dev/null || echo "000"`
    );

    if (httpCode === '200') {
      this.logger.success('✓ Healthy (HTTP 200)');
      return { name: 'Twenty CRM Health', status: 'healthy', httpCode };
    } else {
      this.logger.error(`✗ Unhealthy (HTTP ${httpCode})`);
      return { name: 'Twenty CRM Health', status: 'unhealthy', httpCode };
    }
  }

  private async checkWebhookEndpoint(): Promise<HealthResult> {
    process.stdout.write('3. Webhook endpoint:    ');

    const httpCode = this.executor.execSilent(
      `curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "${this.config.n8nUrl}${this.config.webhookPath}" 2>/dev/null || echo "000"`
    );

    if (httpCode === '204' || httpCode === '200') {
      this.logger.success(`✓ Available (HTTP ${httpCode})`);
      return { name: 'Webhook Endpoint', status: 'healthy', httpCode };
    } else {
      this.logger.error(`✗ Unavailable (HTTP ${httpCode})`);
      return { name: 'Webhook Endpoint', status: 'unhealthy', httpCode };
    }
  }

  private async checkTestSubmission(): Promise<HealthResult> {
    process.stdout.write('4. Test submission:     ');

    const testEmail = `health_${Date.now()}@test.com`;
    const payload = JSON.stringify({
      data: {
        name: 'Health Check',
        email: testEmail,
        company: 'Health Corp',
        role: 'Test',
      },
    });

    const response = this.executor.execSilent(
      `curl -s -w "\\n%{http_code}" -X POST "${this.config.n8nUrl}${this.config.webhookPath}" ` +
      `-H "Content-Type: application/json" ` +
      `-d '${payload}' 2>/dev/null || echo -e "\\n000"`
    );

    const lines = response.split('\n');
    const httpCode = lines[lines.length - 1] || '000';

    if (httpCode === '200') {
      this.logger.success('✓ Working (HTTP 200)');
      return { name: 'Test Submission', status: 'healthy', httpCode };
    } else {
      this.logger.error(`✗ Failed (HTTP ${httpCode})`);
      return { name: 'Test Submission', status: 'unhealthy', httpCode };
    }
  }

  private printSummary(results: HealthResult[]): void {
    console.log();
    console.log('='.repeat(42));

    const failed = results.filter(r => r.status === 'unhealthy');
    if (failed.length === 0) {
      this.logger.success('All health checks passed!');
    } else {
      this.logger.error(`Some health checks failed! (${failed.length} failed)`);
    }

    console.log('='.repeat(42));
  }
}

// Main execution
const main = async (): Promise<void> => {
  const checker = new HealthChecker();
  const exitCode = await checker.run();
  process.exit(exitCode);
};

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
