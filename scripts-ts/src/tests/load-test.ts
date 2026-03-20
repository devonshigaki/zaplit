#!/usr/bin/env ts-node
/**
 * Load Test Script for n8n Webhook (TypeScript)
 * 
 * Performs concurrent load testing on n8n webhook endpoint
 * 
 * Usage: npx ts-node load-test.ts [CONCURRENT] [TOTAL]
 */

import { Logger } from '../lib/logger';
import { CommandExecutor } from '../lib/exec';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

interface LoadTestConfig {
  n8nWebhook: string;
  concurrent: number;
  total: number;
}

interface LoadTestResult {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  duration: number;
  throughput: number;
  minTime: number;
  maxTime: number;
  avgTime: number;
  p95Time: number;
  successRate: number;
  errorCodes: Record<string, number>;
}

interface RequestResult {
  sequence: number;
  httpCode: string;
  responseTime: number;
}

class LoadTest {
  private logger: Logger;
  private executor: CommandExecutor;
  private config: LoadTestConfig;
  private testId: string;
  private tempDir: string;

  constructor() {
    const args = process.argv.slice(2);
    
    this.config = {
      n8nWebhook: process.env.N8N_WEBHOOK || 'https://n8n.zaplit.com/webhook/consultation',
      concurrent: parseInt(args[0] || '10', 10),
      total: parseInt(args[1] || '100', 10),
    };

    this.logger = new Logger();
    this.executor = new CommandExecutor(this.logger);
    this.testId = `LOAD_${Date.now()}`;
    this.tempDir = join(tmpdir(), `n8n-load-test-${this.testId}`);
  }

  async run(): Promise<number> {
    this.printHeader();

    // Create temp directory
    this.setupTempDir();

    try {
      // Generate payloads
      this.generatePayloads();

      // Run load test
      const results = await this.runLoadTest();

      // Analyze and print results
      this.analyzeResults(results);

      return 0;
    } finally {
      // Cleanup
      this.cleanup();
    }
  }

  private printHeader(): void {
    this.logger.header('Load Test', {
      Webhook: this.config.n8nWebhook,
      Concurrent: this.config.concurrent.toString(),
      'Total Requests': this.config.total.toString(),
      'Test ID': this.testId,
    });
  }

  private setupTempDir(): void {
    if (!existsSync(this.tempDir)) {
      mkdirSync(this.tempDir, { recursive: true });
    }
  }

  private cleanup(): void {
    try {
      rmSync(this.tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  private generatePayloads(): void {
    this.logger.info('Generating test payloads...');

    for (let i = 1; i <= this.config.total; i++) {
      const payload = {
        data: {
          name: `${this.testId} User ${i}`,
          email: `${this.testId}_${i}@test.com`,
          company: `${this.testId} Corp ${i}`,
          role: 'Tester',
          teamSize: '11-50',
          techStack: ['CRM: Salesforce', 'Comm: Slack'],
          securityLevel: 'high',
          compliance: ['soc2'],
          message: `Load test submission ${i}`,
        },
        metadata: {
          loadTestId: this.testId,
          sequence: i,
        },
      };

      writeFileSync(join(this.tempDir, `payload_${i}.json`), JSON.stringify(payload));
    }
  }

  private async runLoadTest(): Promise<RequestResult[]> {
    this.logger.info('Running load test...');

    const startTime = Date.now();
    const results: RequestResult[] = [];
    const resultsFile = join(this.tempDir, 'results.csv');
    writeFileSync(resultsFile, 'sequence,http_code,response_time\n');

    // Create a worker function for each request
    const makeRequest = async (sequence: number): Promise<RequestResult> => {
      const payloadFile = join(this.tempDir, `payload_${sequence}.json`);
      const startRequest = Date.now();

      const response = this.executor.execSilent(
        `curl -s -w "\\n%{http_code}\\n%{time_total}" ` +
        `-X POST "${this.config.n8nWebhook}" ` +
        `-H "Content-Type: application/json" ` +
        `-d @"${payloadFile}" ` +
        `2>/dev/null || echo -e "\\n000\\n0"`
      );

      const lines = response.split('\n');
      const httpCode = lines[lines.length - 2] || '000';
      const timeTotal = parseFloat(lines[lines.length - 1] || '0');

      return { sequence, httpCode, responseTime: timeTotal };
    };

    // Run requests with concurrency limit
    const batchSize = this.config.concurrent;
    for (let i = 0; i < this.config.total; i += batchSize) {
      const batch = [];
      for (let j = i; j < Math.min(i + batchSize, this.config.total); j++) {
        batch.push(makeRequest(j + 1));
      }
      const batchResults = await Promise.all(batch);
      results.push(...batchResults);

      // Save batch results
      const batchCsv = batchResults.map(r => `${r.sequence},${r.httpCode},${r.responseTime}`).join('\n');
      const existing = this.executor.execSilent(`cat "${resultsFile}" 2>/dev/null || echo ''`);
      writeFileSync(resultsFile, existing + batchCsv + '\n');
    }

    return results;
  }

  private analyzeResults(results: RequestResult[]): void {
    const totalTime = (Date.now() - this.startTime) / 1000;
    const successCount = results.filter(r => r.httpCode === '200').length;
    const errorCount = results.length - successCount;

    // Calculate response times
    const times = results.map(r => r.responseTime).filter(t => t > 0);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;

    // Calculate P95
    const sortedTimes = [...times].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedTimes.length * 0.95);
    const p95Time = sortedTimes[p95Index] || 0;

    // Calculate success rate
    const successRate = (successCount / results.length) * 100;

    // Count error codes
    const errorCodes: Record<string, number> = {};
    for (const r of results) {
      if (r.httpCode !== '200') {
        errorCodes[r.httpCode] = (errorCodes[r.httpCode] || 0) + 1;
      }
    }

    // Print results
    console.log();
    this.logger.header('Load Test Results');

    console.log(`Duration: ${totalTime.toFixed(1)}s`);
    console.log(`Throughput: ${(results.length / totalTime).toFixed(2)} req/s`);
    console.log();

    console.log('Response Counts:');
    this.logger.success(`  Success (200): ${successCount}`);
    if (errorCount > 0) {
      this.logger.error(`  Failed: ${errorCount}`);
    } else {
      console.log('  Failed: 0');
    }
    console.log();

    console.log('Response Times:');
    console.log(`  Min: ${minTime.toFixed(3)}s`);
    console.log(`  Avg: ${avgTime.toFixed(3)}s`);
    console.log(`  Max: ${maxTime.toFixed(3)}s`);
    console.log(`  P95: ${p95Time.toFixed(3)}s`);
    console.log();

    // Success rate
    if (successRate >= 99) {
      this.logger.success(`Success Rate: ${successRate.toFixed(1)}%`);
    } else if (successRate >= 95) {
      this.logger.warn(`Success Rate: ${successRate.toFixed(1)}%`);
    } else {
      this.logger.error(`Success Rate: ${successRate.toFixed(1)}%`);
    }

    // Error breakdown
    if (errorCount > 0) {
      console.log();
      console.log('Error Breakdown:');
      for (const [code, count] of Object.entries(errorCodes)) {
        console.log(`  ${code}: ${count}`);
      }
    }

    console.log('='.repeat(42));
  }

  private get startTime(): number {
    return Date.now();
  }
}

// Main execution
const main = async (): Promise<void> => {
  const test = new LoadTest();
  const exitCode = await test.run();
  process.exit(exitCode);
};

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
