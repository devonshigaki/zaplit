#!/usr/bin/env ts-node
/**
 * Test Data Cleanup Script for Twenty CRM (TypeScript)
 * 
 * Removes test records created during testing
 * 
 * Usage: TWENTY_TOKEN=xxx npx ts-node cleanup-test-data.ts [--dry-run] <test-prefix>
 */

import { Logger } from '../lib/logger';
import { CommandExecutor } from '../lib/exec';

interface CleanupConfig {
  twentyCrmUrl: string;
  twentyToken: string;
  testPrefix: string;
  dryRun: boolean;
}

interface CleanupResult {
  type: 'people' | 'companies' | 'notes';
  deleted: number;
  errors: string[];
}

class TestDataCleanup {
  private logger: Logger;
  private executor: CommandExecutor;
  private config: CleanupConfig;

  constructor() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const testPrefix = args.find(a => !a.startsWith('--'));

    if (!testPrefix) {
      console.error('Usage: npx ts-node cleanup-test-data.ts [--dry-run] <test-prefix>');
      console.error('Example: npx ts-node cleanup-test-data.ts TEST_1742412345');
      process.exit(1);
    }

    this.config = {
      twentyCrmUrl: process.env.TWENTY_CRM_URL || 'https://crm.zaplit.com',
      twentyToken: process.env.TWENTY_TOKEN || '',
      testPrefix,
      dryRun,
    };

    this.logger = new Logger();
    this.executor = new CommandExecutor(this.logger);

    if (!this.config.twentyToken) {
      this.logger.error('TWENTY_TOKEN environment variable not set');
      process.exit(1);
    }
  }

  async run(): Promise<number> {
    this.printHeader();

    const results: CleanupResult[] = [];

    // Step 1: Query and Delete People (and their notes)
    const peopleResult = await this.cleanupPeople();
    results.push(peopleResult);

    // Step 2: Query and Delete Companies
    const companiesResult = await this.cleanupCompanies();
    results.push(companiesResult);

    // Summary
    this.printSummary(results);
    return 0;
  }

  private printHeader(): void {
    this.logger.header('Twenty CRM Test Data Cleanup');
    console.log(`Test Prefix: ${this.config.testPrefix}`);
    console.log(`CRM URL: ${this.config.twentyCrmUrl}`);
    console.log(`Dry Run: ${this.config.dryRun}`);
    console.log();
  }

  private async cleanupPeople(): Promise<CleanupResult> {
    this.logger.info(`Querying people with prefix: ${this.config.testPrefix}`);

    const result: CleanupResult = { type: 'people', deleted: 0, errors: [] };

    const filter = encodeURIComponent(JSON.stringify({ name: { contains: this.config.testPrefix } }));
    const response = this.executor.execSilent(
      `curl -s -X GET "${this.config.twentyCrmUrl}/rest/people" ` +
      `-H "Authorization: Bearer ${this.config.twentyToken}" ` +
      `-G --data-urlencode "filter=${filter}" 2>/dev/null || echo '{"data":[]}'`
    );

    try {
      const data = JSON.parse(response);
      const people = data.data || [];

      if (people.length === 0) {
        this.logger.warn(`No people found with prefix: ${this.config.testPrefix}`);
        return result;
      }

      this.logger.info(`Found ${people.length} people to delete`);

      // First, delete notes linked to these people
      for (const person of people) {
        await this.deleteNotesForPerson(person.id);
      }

      // Delete people
      for (const person of people) {
        if (this.config.dryRun) {
          this.logger.info(`[DRY RUN] Would delete person: ${person.id}`);
          result.deleted++;
        } else {
          const deleteResult = this.executor.execSilent(
            `curl -s -X DELETE "${this.config.twentyCrmUrl}/rest/people/${person.id}" ` +
            `-H "Authorization: Bearer ${this.config.twentyToken}" 2>/dev/null`
          );
          result.deleted++;
        }
      }

      this.logger.success(`Deleted ${result.deleted} people`);
      return result;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Error querying people: ${err.message}`);
      result.errors.push(err.message);
      return result;
    }
  }

  private async deleteNotesForPerson(personId: string): Promise<number> {
    const filter = encodeURIComponent(JSON.stringify({ person: { eq: personId } }));
    const response = this.executor.execSilent(
      `curl -s -X GET "${this.config.twentyCrmUrl}/rest/notes" ` +
      `-H "Authorization: Bearer ${this.config.twentyToken}" ` +
      `-G --data-urlencode "filter=${filter}" 2>/dev/null || echo '{"data":[]}'`
    );

    try {
      const data = JSON.parse(response);
      const notes = data.data || [];

      for (const note of notes) {
        if (this.config.dryRun) {
          this.logger.info(`[DRY RUN] Would delete note: ${note.id}`);
        } else {
          this.executor.execSilent(
            `curl -s -X DELETE "${this.config.twentyCrmUrl}/rest/notes/${note.id}" ` +
            `-H "Authorization: Bearer ${this.config.twentyToken}" 2>/dev/null`
          );
        }
      }

      return notes.length;
    } catch {
      return 0;
    }
  }

  private async cleanupCompanies(): Promise<CleanupResult> {
    this.logger.info(`Querying companies with prefix: ${this.config.testPrefix}`);

    const result: CleanupResult = { type: 'companies', deleted: 0, errors: [] };

    const filter = encodeURIComponent(JSON.stringify({ name: { contains: this.config.testPrefix } }));
    const response = this.executor.execSilent(
      `curl -s -X GET "${this.config.twentyCrmUrl}/rest/companies" ` +
      `-H "Authorization: Bearer ${this.config.twentyToken}" ` +
      `-G --data-urlencode "filter=${filter}" 2>/dev/null || echo '{"data":[]}'`
    );

    try {
      const data = JSON.parse(response);
      const companies = data.data || [];

      if (companies.length === 0) {
        this.logger.warn(`No companies found with prefix: ${this.config.testPrefix}`);
        return result;
      }

      this.logger.info(`Found ${companies.length} companies to delete`);

      for (const company of companies) {
        if (this.config.dryRun) {
          this.logger.info(`[DRY RUN] Would delete company: ${company.id}`);
          result.deleted++;
        } else {
          this.executor.execSilent(
            `curl -s -X DELETE "${this.config.twentyCrmUrl}/rest/companies/${company.id}" ` +
            `-H "Authorization: Bearer ${this.config.twentyToken}" 2>/dev/null`
          );
          result.deleted++;
        }
      }

      this.logger.success(`Deleted ${result.deleted} companies`);
      return result;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Error querying companies: ${err.message}`);
      result.errors.push(err.message);
      return result;
    }
  }

  private printSummary(results: CleanupResult[]): void {
    const totalPeople = results.find(r => r.type === 'people')?.deleted || 0;
    const totalCompanies = results.find(r => r.type === 'companies')?.deleted || 0;
    const totalNotes = results.find(r => r.type === 'notes')?.deleted || 0;

    console.log();
    console.log('='.repeat(42));
    console.log('  Cleanup Summary');
    console.log('='.repeat(42));

    if (this.config.dryRun) {
      this.logger.info('DRY RUN - No actual deletions performed');
    }

    this.logger.success(`People deleted: ${totalPeople}`);
    this.logger.success(`Companies deleted: ${totalCompanies}`);
    this.logger.success(`Notes deleted: ${totalNotes}`);
    console.log('='.repeat(42));
  }
}

// Main execution
const main = async (): Promise<void> => {
  const cleanup = new TestDataCleanup();
  const exitCode = await cleanup.run();
  process.exit(exitCode);
};

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
