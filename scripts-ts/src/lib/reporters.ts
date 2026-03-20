/**
 * Reporting utilities for verification and deployment
 */
import chalk from 'chalk';
import type { VerificationReport, CheckResult, CheckStatus } from '../types/verification.js';
import type { DeploymentReport, RollbackReport, RollbackResult } from '../types/deployment.js';

export interface OutputOptions {
  detailed: boolean;
  json: boolean;
  verbose: boolean;
}

export class ConsoleReporter {
  constructor(private options: OutputOptions) {}

  printVerificationReport(report: VerificationReport): void {
    if (this.options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    this.printHeader(report.metadata);

    // Group checks by category
    const checksByCategory = this.groupByCategory(report.checks);

    for (const [category, checks] of Object.entries(checksByCategory)) {
      this.printCategory(category, checks);
    }

    this.printSummary(report.summary);
  }

  private printHeader(metadata: VerificationReport['metadata']): void {
    console.log(chalk.bold.cyan('\n╔════════════════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold.cyan('║           Deployment Verification Report                           ║'));
    console.log(chalk.bold.cyan('╚════════════════════════════════════════════════════════════════════╝'));
    console.log(`Instance: ${metadata.instanceName}`);
    console.log(`Zone: ${metadata.zone}`);
    console.log(`Duration: ${metadata.duration}ms`);
    console.log('');
  }

  private printCategory(category: string, checks: CheckResult[]): void {
    console.log(chalk.bold.cyan(`\n${this.formatCategoryName(category)}`));

    for (const check of checks) {
      if (this.options.detailed) {
        this.printDetailedCheck(check);
      } else {
        this.printSimpleCheck(check);
      }
    }
  }

  private printSimpleCheck(check: CheckResult): void {
    const symbol = this.getSymbol(check.status);
    const message = check.status === 'fail'
      ? chalk.red(check.message)
      : check.status === 'warn'
        ? chalk.yellow(check.message)
        : chalk.green(check.message);

    console.log(`  ${symbol} ${check.name}: ${message}`);
  }

  private printDetailedCheck(check: CheckResult): void {
    const symbol = this.getSymbol(check.status);
    console.log(`  ${symbol} ${chalk.bold(check.name)}`);
    console.log(`    Status: ${check.status.toUpperCase()}`);
    console.log(`    Message: ${check.message}`);

    if (check.details) {
      for (const [key, value] of Object.entries(check.details)) {
        console.log(`    ${chalk.gray(`${key}: ${value}`)}`);
      }
    }
  }

  private printSummary(summary: VerificationReport['summary']): void {
    console.log(chalk.bold.cyan('\n=================================='));
    console.log(chalk.bold('Verification Summary'));
    console.log(chalk.bold.cyan('=================================='));
    console.log(`${chalk.green('Passed:')}  ${summary.passed}`);
    console.log(`${chalk.yellow('Warnings:')} ${summary.warnings}`);
    console.log(`${chalk.red('Failed:')}  ${summary.failed}`);
    console.log(chalk.bold.cyan('==================================\n'));

    if (summary.failed === 0) {
      console.log(chalk.green('✓ All critical checks passed!'));
    } else {
      console.log(chalk.red('✗ Some checks failed. Please review.'));
    }
  }

  private groupByCategory(checks: CheckResult[]): Record<string, CheckResult[]> {
    return checks.reduce((acc, check) => {
      const category = check.category || 'general';
      acc[category] = acc[category] || [];
      acc[category].push(check);
      return acc;
    }, {} as Record<string, CheckResult[]>);
  }

  private formatCategoryName(category: string): string {
    return category
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private getSymbol(status: CheckStatus): string {
    switch (status) {
      case 'pass': return chalk.green('✓');
      case 'warn': return chalk.yellow('⚠');
      case 'fail': return chalk.red('✗');
      default: return chalk.gray('?');
    }
  }
}

export class DeploymentReporter {
  render(report: DeploymentReport): void {
    console.log(chalk.bold.cyan('\n╔════════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold.cyan('║              Deployment Summary                              ║'));
    console.log(chalk.bold.cyan('╚════════════════════════════════════════════════════════════╝\n'));

    console.log(chalk.bold('Deployment Status:'));
    console.log(chalk.bold('=================================='));

    for (const [phase, data] of Object.entries(report.phases)) {
      const icon = this.getStatusIcon(data.status);
      console.log(`  ${icon} ${phase}: ${data.status}`);
    }

    console.log('');
    console.log(chalk.bold(`Completed Steps: ${report.summary.completed}`));

    if (report.summary.failed > 0) {
      console.log(chalk.red(`Failed Steps: ${report.summary.failed}`));
    }

    console.log('');
    console.log(chalk.bold('=================================='));
    console.log('Next Steps:');
    console.log('  1. Run verification: npm run verify:deployment');
    console.log('  2. Review runbook: runbooks/RB-DEPLOY-001-Phase1.md');
    console.log('  3. Complete manual data quality steps');

    console.log('');
    if (report.status === 'success') {
      console.log(chalk.green('✓ Phase 1 deployment completed successfully!'));
    } else if (report.status === 'partial') {
      console.log(chalk.yellow('⚠ Phase 1 deployment completed with warnings.'));
    } else {
      console.log(chalk.red('✗ Phase 1 deployment failed.'));
    }
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case 'completed': return chalk.green('✓');
      case 'skipped': return chalk.yellow('○');
      case 'dry_run': return chalk.yellow('○');
      case 'manual_required': return chalk.yellow('⚠');
      case 'failed': return chalk.red('✗');
      default: return chalk.gray('?');
    }
  }
}

export class RollbackReporter {
  render(report: RollbackReport): void {
    console.log(chalk.bold.cyan('\n╔════════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold.cyan('║              Rollback Summary                                ║'));
    console.log(chalk.bold.cyan('╚════════════════════════════════════════════════════════════╝\n'));

    if (report.cancelled) {
      console.log(chalk.yellow('⚠ Rollback was cancelled by user'));
      return;
    }

    for (const result of report.results) {
      const icon = result.success ? chalk.green('✓') : chalk.red('✗');
      console.log(`${icon} ${result.component}: ${result.success ? 'Rolled back' : 'Failed'}`);
      if (result.error) {
        console.log(`  ${chalk.red(result.error.message)}`);
      }
    }

    console.log('');
    console.log(chalk.bold(`Duration: ${report.duration}ms`));

    if (report.success) {
      console.log(chalk.green('\n✓ Rollback completed successfully'));
      console.log(chalk.yellow('⚠ Please verify system functionality'));
    } else {
      console.log(chalk.red('\n✗ Rollback completed with errors'));
      console.log(chalk.red('⚠ Manual intervention may be required'));
    }
  }
}
