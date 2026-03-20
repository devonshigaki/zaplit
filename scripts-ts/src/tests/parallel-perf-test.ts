#!/usr/bin/env ts-node
/**
 * Parallel Workflow Performance Test
 * 
 * Comprehensive performance testing for n8n parallel workflow v4
 * Measures P50, P95, P99 latency and compares sequential vs parallel execution
 * 
 * Usage:
 *   npx ts-node parallel-perf-test.ts [options]
 *   
 * Options:
 *   --webhook-v3 <url>     v3 webhook URL (sequential baseline)
 *   --webhook-v4 <url>     v4 webhook URL (parallel optimized)
 *   --requests <n>         Total requests per test (default: 100)
 *   --concurrent <n>       Concurrent connections (default: 10)
 *   --duration <s>         Test duration in seconds (default: 60)
 *   --output <path>        Output directory for reports (default: ./perf-results)
 */

import { Logger } from '../lib/logger';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

// Test configuration
interface PerfTestConfig {
  webhookV3: string;
  webhookV4: string;
  requests: number;
  concurrent: number;
  duration: number;
  outputDir: string;
}

// Test result structure
interface RequestMetrics {
  sequence: number;
  version: 'v3' | 'v4';
  httpCode: number;
  responseTime: number;
  connectTime: number;
  tlsTime: number;
  totalTime: number;
  success: boolean;
  error?: string;
}

interface TestSummary {
  version: 'v3' | 'v4';
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRate: number;
  throughput: number;
  minTime: number;
  maxTime: number;
  avgTime: number;
  p50: number;
  p95: number;
  p99: number;
  avgConnectTime: number;
  avgTlsTime: number;
}

interface ComparisonResult {
  v3: TestSummary;
  v4: TestSummary;
  improvement: {
    p95Ms: number;
    p95Percent: number;
    throughputPercent: number;
    errorRateDelta: number;
  };
}

class ParallelPerfTest {
  private logger: Logger;
  private config: PerfTestConfig;
  private testId: string;
  private startTime: number;

  constructor() {
    this.logger = new Logger({ prefix: 'PERF-TEST' });
    this.testId = `PERF_${Date.now()}`;
    this.startTime = Date.now();
    
    // Parse command line arguments
    const args = this.parseArgs();
    
    this.config = {
      webhookV3: args['webhook-v3'] || process.env.N8N_WEBHOOK_V3 || 'https://n8n.zaplit.com/webhook/consultation',
      webhookV4: args['webhook-v4'] || process.env.N8N_WEBHOOK_V4 || 'https://n8n.zaplit.com/webhook/consultation-v4',
      requests: parseInt(args['requests'] || '100', 10),
      concurrent: parseInt(args['concurrent'] || '10', 10),
      duration: parseInt(args['duration'] || '60', 10),
      outputDir: args['output'] || './perf-results',
    };
  }

  private parseArgs(): Record<string, string> {
    const args: Record<string, string> = {};
    const argv = process.argv.slice(2);
    
    for (let i = 0; i < argv.length; i++) {
      if (argv[i].startsWith('--')) {
        const key = argv[i].slice(2);
        const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : 'true';
        args[key] = value;
        if (value !== 'true') i++;
      }
    }
    
    return args;
  }

  async run(): Promise<number> {
    this.printHeader();
    
    // Setup output directory
    this.setupOutputDir();
    
    try {
      // Verify webhooks are accessible
      await this.verifyEndpoints();
      
      // Run v3 baseline test
      this.logger.info('Starting v3 (sequential) baseline test...');
      const v3Results = await this.runTest('v3', this.config.webhookV3);
      const v3Summary = this.analyzeResults(v3Results);
      this.printSummary(v3Summary);
      
      // Brief pause between tests
      await this.sleep(2000);
      
      // Run v4 parallel test
      this.logger.info('Starting v4 (parallel) optimized test...');
      const v4Results = await this.runTest('v4', this.config.webhookV4);
      const v4Summary = this.analyzeResults(v4Results);
      this.printSummary(v4Summary);
      
      // Compare and generate report
      const comparison = this.compareResults(v3Summary, v4Summary);
      this.printComparison(comparison);
      
      // Generate detailed report
      await this.generateReport(v3Results, v4Results, v3Summary, v4Summary, comparison);
      
      // Validate against targets
      const passed = this.validateTargets(v4Summary);
      
      return passed ? 0 : 1;
    } catch (error) {
      this.logger.error(`Test failed: ${error instanceof Error ? error.message : String(error)}`);
      return 1;
    }
  }

  private printHeader(): void {
    this.logger.header('Parallel Workflow Performance Test', {
      'Test ID': this.testId,
      'v3 Webhook': this.config.webhookV3,
      'v4 Webhook': this.config.webhookV4,
      'Requests': this.config.requests.toString(),
      'Concurrent': this.config.concurrent.toString(),
      'Duration': `${this.config.duration}s`,
      'Output': this.config.outputDir,
    });
  }

  private setupOutputDir(): void {
    const testDir = join(this.config.outputDir, this.testId);
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  }

  private async verifyEndpoints(): Promise<void> {
    this.logger.info('Verifying webhook endpoints...');
    
    for (const [version, url] of [['v3', this.config.webhookV3], ['v4', this.config.webhookV4]] as const) {
      try {
        const response = execSync(
          `curl -s -o /dev/null -w "%{http_code}" -X GET "${url}/health" 2>/dev/null || echo "000"`,
          { timeout: 10000 }
        ).toString().trim();
        
        if (response === '000') {
          this.logger.warn(`${version} endpoint health check failed - may not support GET`);
        } else {
          this.logger.info(`${version} endpoint responded with HTTP ${response}`);
        }
      } catch {
        this.logger.warn(`${version} endpoint verification inconclusive`);
      }
    }
  }

  private async runTest(version: 'v3' | 'v4', webhookUrl: string): Promise<RequestMetrics[]> {
    const results: RequestMetrics[] = [];
    const requestsPerBatch = Math.min(this.config.concurrent, this.config.requests);
    const totalBatches = Math.ceil(this.config.requests / requestsPerBatch);
    
    this.logger.info(`Running ${this.config.requests} requests in ${totalBatches} batches...`);
    
    const testStartTime = Date.now();
    
    for (let batch = 0; batch < totalBatches && (Date.now() - testStartTime) < this.config.duration * 1000; batch++) {
      const batchPromises: Promise<RequestMetrics>[] = [];
      const remainingRequests = this.config.requests - (batch * requestsPerBatch);
      const batchSize = Math.min(requestsPerBatch, remainingRequests);
      
      for (let i = 0; i < batchSize; i++) {
        const sequence = batch * requestsPerBatch + i + 1;
        batchPromises.push(this.executeRequest(version, webhookUrl, sequence));
      }
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Progress update every 10%
      if (batch % Math.max(1, Math.floor(totalBatches / 10)) === 0) {
        const progress = Math.round((batch / totalBatches) * 100);
        this.logger.info(`Progress: ${progress}% (${results.length} requests completed)`);
      }
    }
    
    return results;
  }

  private async executeRequest(version: 'v3' | 'v4', webhookUrl: string, sequence: number): Promise<RequestMetrics> {
    const payload = {
      data: {
        name: `${version.toUpperCase()} Test User ${sequence}`,
        email: `${this.testId}_${version}_${sequence}@perf-test.com`,
        company: `Perf Corp ${sequence % 10}`,
        role: 'Performance Tester',
        teamSize: '11-50',
        techStack: ['React', 'Node.js', 'PostgreSQL'],
        securityLevel: 'high',
        compliance: ['soc2', 'gdpr'],
        message: `Performance test submission ${sequence} for ${version}`,
      },
      metadata: {
        testId: this.testId,
        version,
        sequence,
        timestamp: new Date().toISOString(),
      },
    };

    const payloadJson = JSON.stringify(payload).replace(/"/g, '\\"');
    const startTime = Date.now();
    
    try {
      // Execute curl with detailed timing
      const curlCmd = `curl -s -w "\\nHTTP_CODE:%{http_code}\\nTIME_TOTAL:%{time_total}\\nTIME_CONNECT:%{time_connect}\\nTIME_APPCONNECT:%{time_appconnect}\\nTIME_PRETRANSFER:%{time_pretransfer}\\nTIME_STARTTRANSFER:%{time_starttransfer}" \
        -X POST "${webhookUrl}" \
        -H "Content-Type: application/json" \
        -H "X-Test-ID: ${this.testId}" \
        -H "X-Test-Version: ${version}" \
        -d "${payloadJson}" \
        --max-time 30 \
        2>/dev/null`;
      
      const output = execSync(curlCmd, { timeout: 35000 }).toString();
      const totalTime = Date.now() - startTime;
      
      // Parse timing data
      const httpCodeMatch = output.match(/HTTP_CODE:(\d+)/);
      const timeTotalMatch = output.match(/TIME_TOTAL:([\d.]+)/);
      const timeConnectMatch = output.match(/TIME_CONNECT:([\d.]+)/);
      const timeAppconnectMatch = output.match(/TIME_APPCONNECT:([\d.]+)/);
      
      const httpCode = httpCodeMatch ? parseInt(httpCodeMatch[1], 10) : 0;
      const responseTime = timeTotalMatch ? parseFloat(timeTotalMatch[1]) * 1000 : 0;
      const connectTime = timeConnectMatch ? parseFloat(timeConnectMatch[1]) * 1000 : 0;
      const tlsTime = timeAppconnectMatch ? parseFloat(timeAppconnectMatch[1]) * 1000 : 0;
      
      return {
        sequence,
        version,
        httpCode,
        responseTime,
        connectTime,
        tlsTime,
        totalTime,
        success: httpCode === 200,
      };
    } catch (error) {
      return {
        sequence,
        version,
        httpCode: 0,
        responseTime: Date.now() - startTime,
        connectTime: 0,
        tlsTime: 0,
        totalTime: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private analyzeResults(results: RequestMetrics[]): TestSummary {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const responseTimes = successful.map(r => r.responseTime).sort((a, b) => a - b);
    
    const totalDuration = Math.max(...results.map(r => r.totalTime)) - Math.min(...results.map(r => r.totalTime));
    const throughput = successful.length / (totalDuration / 1000 || 1);
    
    const calcPercentile = (p: number): number => {
      const index = Math.ceil((p / 100) * responseTimes.length) - 1;
      return responseTimes[Math.max(0, index)] || 0;
    };
    
    return {
      version: results[0]?.version || 'v4',
      totalRequests: results.length,
      successfulRequests: successful.length,
      failedRequests: failed.length,
      errorRate: (failed.length / results.length) * 100,
      throughput,
      minTime: responseTimes[0] || 0,
      maxTime: responseTimes[responseTimes.length - 1] || 0,
      avgTime: responseTimes.reduce((a, b) => a + b, 0) / (responseTimes.length || 1),
      p50: calcPercentile(50),
      p95: calcPercentile(95),
      p99: calcPercentile(99),
      avgConnectTime: successful.reduce((a, r) => a + r.connectTime, 0) / (successful.length || 1),
      avgTlsTime: successful.reduce((a, r) => a + r.tlsTime, 0) / (successful.length || 1),
    };
  }

  private printSummary(summary: TestSummary): void {
    console.log();
    this.logger.header(`${summary.version.toUpperCase()} Test Summary`);
    
    console.log('Request Counts:');
    console.log(`  Total: ${summary.totalRequests}`);
    console.log(`  Successful: ${summary.successfulRequests}`);
    console.log(`  Failed: ${summary.failedRequests}`);
    console.log(`  Error Rate: ${summary.errorRate.toFixed(2)}%`);
    console.log();
    
    console.log('Response Times (ms):');
    console.log(`  Min: ${summary.minTime.toFixed(0)}`);
    console.log(`  Avg: ${summary.avgTime.toFixed(0)}`);
    console.log(`  Max: ${summary.maxTime.toFixed(0)}`);
    console.log(`  P50: ${summary.p50.toFixed(0)}`);
    console.log(`  P95: ${summary.p95.toFixed(0)}`);
    console.log(`  P99: ${summary.p99.toFixed(0)}`);
    console.log();
    
    console.log('Connection Metrics:');
    console.log(`  Avg Connect Time: ${summary.avgConnectTime.toFixed(0)}ms`);
    console.log(`  Avg TLS Time: ${summary.avgTlsTime.toFixed(0)}ms`);
    console.log(`  Throughput: ${summary.throughput.toFixed(2)} req/s`);
    console.log();
  }

  private compareResults(v3: TestSummary, v4: TestSummary): ComparisonResult {
    const p95Improvement = v3.p95 - v4.p95;
    const p95ImprovementPercent = ((v3.p95 - v4.p95) / v3.p95) * 100;
    const throughputImprovement = ((v4.throughput - v3.throughput) / v3.throughput) * 100;
    const errorRateDelta = v4.errorRate - v3.errorRate;
    
    return {
      v3,
      v4,
      improvement: {
        p95Ms: p95Improvement,
        p95Percent: p95ImprovementPercent,
        throughputPercent: throughputImprovement,
        errorRateDelta,
      },
    };
  }

  private printComparison(comparison: ComparisonResult): void {
    console.log();
    this.logger.header('Performance Comparison: v3 vs v4');
    
    const { improvement } = comparison;
    
    console.log('Latency Improvements:');
    console.log(`  P95 Reduction: ${improvement.p95Ms.toFixed(0)}ms (${improvement.p95Percent.toFixed(1)}%)`);
    console.log(`  v3 P95: ${comparison.v3.p95.toFixed(0)}ms`);
    console.log(`  v4 P95: ${comparison.v4.p95.toFixed(0)}ms`);
    
    if (improvement.p95Percent >= 10) {
      this.logger.success(`✅ P95 improvement target met (>10%)`);
    } else if (improvement.p95Percent >= 5) {
      this.logger.warn(`⚠️ P95 improvement below target (${improvement.p95Percent.toFixed(1)}%)`);
    } else {
      this.logger.error(`❌ P95 regression detected`);
    }
    console.log();
    
    console.log('Throughput:');
    console.log(`  v3: ${comparison.v3.throughput.toFixed(2)} req/s`);
    console.log(`  v4: ${comparison.v4.throughput.toFixed(2)} req/s`);
    console.log(`  Improvement: ${improvement.throughputPercent.toFixed(1)}%`);
    console.log();
    
    console.log('Error Rate:');
    console.log(`  v3: ${comparison.v3.errorRate.toFixed(2)}%`);
    console.log(`  v4: ${comparison.v4.errorRate.toFixed(2)}%`);
    console.log(`  Delta: ${improvement.errorRateDelta > 0 ? '+' : ''}${improvement.errorRateDelta.toFixed(2)}%`);
    
    if (improvement.errorRateDelta > 0.5) {
      this.logger.error(`❌ Error rate increased significantly`);
    }
    console.log();
  }

  private validateTargets(v4Summary: TestSummary): boolean {
    console.log();
    this.logger.header('Target Validation');
    
    const checks = [
      { name: 'P95 Latency < 3000ms', pass: v4Summary.p95 < 3000, value: `${v4Summary.p95.toFixed(0)}ms` },
      { name: 'P50 Latency < 2000ms', pass: v4Summary.p50 < 2000, value: `${v4Summary.p50.toFixed(0)}ms` },
      { name: 'Error Rate < 1%', pass: v4Summary.errorRate < 1, value: `${v4Summary.errorRate.toFixed(2)}%` },
      { name: 'Throughput > 20 req/s', pass: v4Summary.throughput > 20, value: `${v4Summary.throughput.toFixed(2)} req/s` },
    ];
    
    let allPassed = true;
    for (const check of checks) {
      const status = check.pass ? '✅ PASS' : '❌ FAIL';
      console.log(`${status} ${check.name} (${check.value})`);
      if (!check.pass) allPassed = false;
    }
    
    console.log();
    if (allPassed) {
      this.logger.success('All performance targets met!');
    } else {
      this.logger.error('Some performance targets not met');
    }
    
    return allPassed;
  }

  private async generateReport(
    v3Results: RequestMetrics[],
    v4Results: RequestMetrics[],
    v3Summary: TestSummary,
    v4Summary: TestSummary,
    comparison: ComparisonResult
  ): Promise<void> {
    const outputPath = join(this.config.outputDir, this.testId);
    
    // Write raw data as CSV
    const writeCsv = (filename: string, data: RequestMetrics[]) => {
      const header = 'sequence,version,httpCode,responseTime,connectTime,tlsTime,totalTime,success\n';
      const rows = data.map(r => 
        `${r.sequence},${r.version},${r.httpCode},${r.responseTime},${r.connectTime},${r.tlsTime},${r.totalTime},${r.success}`
      ).join('\n');
      writeFileSync(join(outputPath, filename), header + rows);
    };
    
    writeCsv('v3-raw-data.csv', v3Results);
    writeCsv('v4-raw-data.csv', v4Results);
    
    // Generate JSON report
    const report = {
      testId: this.testId,
      timestamp: new Date().toISOString(),
      configuration: this.config,
      v3: v3Summary,
      v4: v4Summary,
      comparison: comparison.improvement,
      targets: {
        p95TargetMet: v4Summary.p95 < 3000,
        p50TargetMet: v4Summary.p50 < 2000,
        errorRateTargetMet: v4Summary.errorRate < 1,
        throughputTargetMet: v4Summary.throughput > 20,
      },
    };
    
    writeFileSync(join(outputPath, 'report.json'), JSON.stringify(report, null, 2));
    
    // Generate Markdown report
    const mdReport = this.generateMarkdownReport(report);
    writeFileSync(join(outputPath, 'report.md'), mdReport);
    
    this.logger.info(`Reports saved to: ${outputPath}`);
    this.logger.info(`  - v3-raw-data.csv`);
    this.logger.info(`  - v4-raw-data.csv`);
    this.logger.info(`  - report.json`);
    this.logger.info(`  - report.md`);
  }

  private generateMarkdownReport(report: any): string {
    return `# Parallel Workflow Performance Test Report

**Test ID:** ${report.testId}  
**Date:** ${report.timestamp}

## Configuration

| Parameter | Value |
|-----------|-------|
| v3 Webhook | ${report.configuration.webhookV3} |
| v4 Webhook | ${report.configuration.webhookV4} |
| Total Requests | ${report.configuration.requests} |
| Concurrent | ${report.configuration.concurrent} |
| Duration | ${report.configuration.duration}s |

## Results Summary

### v3 (Sequential Baseline)

| Metric | Value |
|--------|-------|
| Total Requests | ${report.v3.totalRequests} |
| Successful | ${report.v3.successfulRequests} |
| Failed | ${report.v3.failedRequests} |
| Error Rate | ${report.v3.errorRate.toFixed(2)}% |
| P50 | ${report.v3.p50.toFixed(0)}ms |
| P95 | ${report.v3.p95.toFixed(0)}ms |
| P99 | ${report.v3.p99.toFixed(0)}ms |
| Throughput | ${report.v3.throughput.toFixed(2)} req/s |

### v4 (Parallel Optimized)

| Metric | Value |
|--------|-------|
| Total Requests | ${report.v4.totalRequests} |
| Successful | ${report.v4.successfulRequests} |
| Failed | ${report.v4.failedRequests} |
| Error Rate | ${report.v4.errorRate.toFixed(2)}% |
| P50 | ${report.v4.p50.toFixed(0)}ms |
| P95 | ${report.v4.p95.toFixed(0)}ms |
| P99 | ${report.v4.p99.toFixed(0)}ms |
| Throughput | ${report.v4.throughput.toFixed(2)} req/s |

## Comparison

| Metric | Improvement |
|--------|-------------|
| P95 Latency | ${report.comparison.p95Ms.toFixed(0)}ms (${report.comparison.p95Percent.toFixed(1)}%) |
| Throughput | ${report.comparison.throughputPercent.toFixed(1)}% |
| Error Rate Delta | ${report.comparison.errorRateDelta > 0 ? '+' : ''}${report.comparison.errorRateDelta.toFixed(2)}% |

## Target Validation

| Target | Status | Value |
|--------|--------|-------|
| P95 < 3000ms | ${report.targets.p95TargetMet ? '✅ PASS' : '❌ FAIL'} | ${report.v4.p95.toFixed(0)}ms |
| P50 < 2000ms | ${report.targets.p50TargetMet ? '✅ PASS' : '❌ FAIL'} | ${report.v4.p50.toFixed(0)}ms |
| Error Rate < 1% | ${report.targets.errorRateTargetMet ? '✅ PASS' : '❌ FAIL'} | ${report.v4.errorRate.toFixed(2)}% |
| Throughput > 20 req/s | ${report.targets.throughputTargetMet ? '✅ PASS' : '❌ FAIL'} | ${report.v4.throughput.toFixed(2)} req/s |

## Conclusion

${report.targets.p95TargetMet && report.targets.p50TargetMet && report.targets.errorRateTargetMet ? '✅ **All performance targets met. The v4 parallel workflow is ready for production deployment.**' : '❌ **Some performance targets not met. Review and optimization recommended before production deployment.**'}
`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
const main = async (): Promise<void> => {
  const test = new ParallelPerfTest();
  const exitCode = await test.run();
  process.exit(exitCode);
};

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
