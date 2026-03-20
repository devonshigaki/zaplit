#!/usr/bin/env ts-node
/**
 * CRM Record Verification Script (TypeScript)
 * 
 * Verifies that test records were created correctly in Twenty CRM
 * 
 * Usage: TWENTY_TOKEN=xxx npx ts-node verify-crm-records.ts <test-id>
 */

import { Logger } from '../lib/logger';
import { CommandExecutor } from '../lib/exec';

interface VerificationConfig {
  twentyCrmUrl: string;
  twentyToken: string;
  testId: string;
}

interface VerificationResult {
  type: 'person' | 'company' | 'notes';
  found: boolean;
  details?: Record<string, any>;
  error?: string;
}

class CRMRecordVerifier {
  private logger: Logger;
  private executor: CommandExecutor;
  private config: VerificationConfig;

  constructor(config: Partial<VerificationConfig> = {}) {
    const testId = config.testId || process.argv[2];
    if (!testId) {
      console.error('Usage: npx ts-node verify-crm-records.ts <test-id>');
      process.exit(1);
    }

    this.config = {
      twentyCrmUrl: config.twentyCrmUrl || process.env.TWENTY_CRM_URL || 'https://crm.zaplit.com',
      twentyToken: config.twentyToken || process.env.TWENTY_TOKEN || '',
      testId,
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

    const results: VerificationResult[] = [];
    let personId: string | undefined;

    // Step 1: Verify Person
    const personResult = await this.verifyPerson();
    results.push(personResult);
    if (personResult.found && personResult.details?.personId) {
      personId = personResult.details.personId;
    }

    console.log();

    // Step 2: Verify Company
    results.push(await this.verifyCompany());

    console.log();

    // Step 3: Verify Notes
    if (personId) {
      results.push(await this.verifyNotes(personId));
    } else {
      this.logger.error('Skipping note verification - person not found');
      results.push({ type: 'notes', found: false, error: 'Person not found' });
    }

    // Summary
    return this.printSummary(results);
  }

  private printHeader(): void {
    this.logger.header('CRM Record Verification');
    console.log(`Test ID: ${this.config.testId}`);
    console.log();
  }

  private async verifyPerson(): Promise<VerificationResult> {
    this.logger.info('Querying person...');

    const filter = encodeURIComponent(JSON.stringify({ name: { contains: this.config.testId } }));
    const response = this.executor.execSilent(
      `curl -s -X GET "${this.config.twentyCrmUrl}/rest/people" ` +
      `-H "Authorization: Bearer ${this.config.twentyToken}" ` +
      `-G --data-urlencode "filter=${filter}" 2>/dev/null || echo '{}'"
    );

    try {
      const data = JSON.parse(response);
      const person = data.data?.[0];

      if (!person) {
        this.logger.error('Person not found');
        return { type: 'person', found: false, error: 'Not found' };
      }

      const personId = person.id;
      const firstName = person.name?.firstName || '';
      const lastName = person.name?.lastName || '';
      const email = person.emails?.[0]?.email || person.email || '';
      const jobTitle = person.jobTitle || '';

      this.logger.success(`Person found: ${firstName} ${lastName}`);
      this.logger.log('info', `  ID: ${personId}`);
      this.logger.log('info', `  Email: ${email}`);
      this.logger.log('info', `  Job Title: ${jobTitle}`);

      // Verify name contains test ID
      if (firstName.includes(this.config.testId)) {
        this.logger.success('Name contains test ID');
        return {
          type: 'person',
          found: true,
          details: { personId, firstName, lastName, email, jobTitle },
        };
      } else {
        this.logger.error('Name does not contain test ID');
        return { type: 'person', found: false, error: 'Test ID not in name' };
      }
    } catch {
      this.logger.error('Invalid response from CRM');
      return { type: 'person', found: false, error: 'Invalid response' };
    }
  }

  private async verifyCompany(): Promise<VerificationResult> {
    this.logger.info('Querying company...');

    const filter = encodeURIComponent(JSON.stringify({ name: { contains: this.config.testId } }));
    const response = this.executor.execSilent(
      `curl -s -X GET "${this.config.twentyCrmUrl}/rest/companies" ` +
      `-H "Authorization: Bearer ${this.config.twentyToken}" ` +
      `-G --data-urlencode "filter=${filter}" 2>/dev/null || echo '{}'"
    );

    try {
      const data = JSON.parse(response);
      const company = data.data?.[0];

      if (!company) {
        this.logger.error('Company not found');
        return { type: 'company', found: false, error: 'Not found' };
      }

      const companyId = company.id;
      const name = company.name || '';

      this.logger.success(`Company found: ${name}`);
      this.logger.log('info', `  ID: ${companyId}`);

      // Verify name contains test ID
      if (name.includes(this.config.testId)) {
        this.logger.success('Company name contains test ID');
        return { type: 'company', found: true, details: { companyId, name } };
      } else {
        this.logger.error('Company name does not contain test ID');
        return { type: 'company', found: false, error: 'Test ID not in name' };
      }
    } catch {
      this.logger.error('Invalid response from CRM');
      return { type: 'company', found: false, error: 'Invalid response' };
    }
  }

  private async verifyNotes(personId: string): Promise<VerificationResult> {
    this.logger.info('Querying notes...');

    const filter = encodeURIComponent(JSON.stringify({ person: { eq: personId } }));
    const response = this.executor.execSilent(
      `curl -s -X GET "${this.config.twentyCrmUrl}/rest/notes" ` +
      `-H "Authorization: Bearer ${this.config.twentyToken}" ` +
      `-G --data-urlencode "filter=${filter}" 2>/dev/null || echo '{"data":[]}'`
    );

    try {
      const data = JSON.parse(response);
      const notesCount = data.data?.length || 0;

      if (notesCount === 0) {
        this.logger.error('No notes found for person');
        return { type: 'notes', found: false, error: 'No notes found' };
      }

      this.logger.success(`Found ${notesCount} note(s)`);

      // Verify first note has content
      const note = data.data[0];
      const noteBody = note.body || '';
      const noteTitle = note.title || '';

      this.logger.log('info', `  Title: ${noteTitle}`);
      this.logger.log('info', `  Body preview: ${noteBody.substring(0, 100)}...`);

      if (noteBody.length > 10) {
        this.logger.success('Note has meaningful content');
        return { type: 'notes', found: true, details: { noteId: note.id, notesCount, noteTitle } };
      } else {
        this.logger.error('Note body is empty or too short');
        return { type: 'notes', found: false, error: 'Empty note body' };
      }
    } catch {
      this.logger.error('Invalid response from CRM');
      return { type: 'notes', found: false, error: 'Invalid response' };
    }
  }

  private printSummary(results: VerificationResult[]): number {
    console.log();
    console.log('='.repeat(42));

    const allPassed = results.every(r => r.found);

    if (allPassed) {
      this.logger.success('All verifications passed!');
      console.log('='.repeat(42));
      return 0;
    } else {
      this.logger.error('Some verifications failed');
      console.log('='.repeat(42));
      return 1;
    }
  }
}

// Main execution
const main = async (): Promise<void> => {
  const verifier = new CRMRecordVerifier();
  const exitCode = await verifier.run();
  process.exit(exitCode);
};

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
