#!/usr/bin/env ts-node
/**
 * Integration Test Runner (TypeScript)
 * 
 * End-to-end test for n8n → Twenty CRM workflow
 * 
 * Usage: TWENTY_TOKEN=xxx npx ts-node run-integration-test.ts
 */

import { Logger } from '../lib/logger';
import { CommandExecutor } from '../lib/exec';

interface TestConfig {
  n8nWebhook: string;
  twentyCrmUrl: string;
  twentyToken: string;
}

interface TestData {
  testId: string;
  email: string;
  name: string;
  company: string;
}

interface TestResult {
  step: string;
  passed: boolean;
  details?: Record<string, any>;
  error?: string;
}

class IntegrationTest {
  private logger: Logger;
  private executor: CommandExecutor;
  private config: TestConfig;
  private testData: TestData;
  private personId?: string;
  private companyId?: string;
  private noteId?: string;

  constructor(config: Partial<TestConfig> = {}) {
    this.config = {
      n8nWebhook: config.n8nWebhook || process.env.N8N_WEBHOOK || 'https://n8n.zaplit.com/webhook/consultation',
      twentyCrmUrl: config.twentyCrmUrl || process.env.TWENTY_CRM_URL || 'https://crm.zaplit.com',
      twentyToken: config.twentyToken || process.env.TWENTY_TOKEN || '',
    };

    this.logger = new Logger();
    this.executor = new CommandExecutor(this.logger);

    // Generate test data
    const timestamp = Math.floor(Date.now() / 1000);
    this.testData = {
      testId: `INTEGRATION_${timestamp}`,
      email: `INTEGRATION_${timestamp}@test.example.com`,
      name: `INTEGRATION_${timestamp}_John Smith`,
      company: `INTEGRATION_${timestamp}_Acme Corporation`,
    };
  }

  async run(): Promise<number> {
    // Validate
    if (!this.config.twentyToken) {
      this.logger.error('TWENTY_TOKEN environment variable not set');
      return 1;
    }

    this.printHeader();

    const results: TestResult[] = [];

    // Step 1: Submit Form
    results.push(await this.step1SubmitForm());

    // Wait for processing
    this.logger.info('Waiting for CRM processing (3s)...');
    await this.sleep(3000);

    // Step 2: Verify Person
    results.push(await this.step2VerifyPerson());

    // Step 3: Verify Company
    results.push(await this.step3VerifyCompany());

    // Step 4: Verify Notes
    results.push(await this.step4VerifyNotes());

    // Step 5: Cleanup
    results.push(await this.step5Cleanup());

    // Summary
    return this.printSummary(results);
  }

  private printHeader(): void {
    this.logger.header('Integration Test: n8n → Twenty CRM', {
      'Test ID': this.testData.testId,
      Webhook: this.config.n8nWebhook,
    });
  }

  private async step1SubmitForm(): Promise<TestResult> {
    this.logger.log('step', '1. Submitting test form...');

    const payload = JSON.stringify({
      data: {
        name: this.testData.name,
        email: this.testData.email,
        company: this.testData.company,
        role: 'CTO',
        teamSize: '11-50',
        techStack: ['CRM: Salesforce', 'Comm: Slack'],
        securityLevel: 'high',
        compliance: ['soc2', 'gdpr'],
        message: 'Integration test submission - checking end-to-end flow',
      },
      metadata: {
        testId: this.testData.testId,
        timestamp: new Date().toISOString(),
      },
    });

    const response = this.executor.execSilent(
      `curl -s -w "\\n%{http_code}" -X POST "${this.config.n8nWebhook}" ` +
      `-H "Content-Type: application/json" ` +
      `-d '${payload}' 2>/dev/null || echo -e "\\n000"`
    );

    const lines = response.split('\n');
    const httpCode = lines[lines.length - 1] || '000';
    const body = lines.slice(0, -1).join('\n');

    if (httpCode === '200') {
      this.logger.success('Form submitted successfully');
      this.logger.info(`Response: ${body.substring(0, 100)}...`);
      return { step: 'Submit Form', passed: true };
    } else {
      this.logger.error(`Form submission failed (HTTP ${httpCode})`);
      this.logger.error(`Response: ${body}`);
      return { step: 'Submit Form', passed: false, error: `HTTP ${httpCode}` };
    }
  }

  private async step2VerifyPerson(): Promise<TestResult> {
    this.logger.log('step', '2. Verifying Person creation...');

    const filter = encodeURIComponent(JSON.stringify({ emails: { email: { eq: this.testData.email } } }));
    const response = this.executor.execSilent(
      `curl -s -X GET "${this.config.twentyCrmUrl}/rest/people" ` +
      `-H "Authorization: Bearer ${this.config.twentyToken}" ` +
      `-G --data-urlencode "filter=${filter}" 2>/dev/null || echo '{}'"
    );

    try {
      const data = JSON.parse(response);
      const person = data.data?.[0];

      if (person && response.includes(this.testData.email)) {
        this.personId = person.id;
        this.logger.success('Person created successfully');
        this.logger.info(`Person ID: ${this.personId}`);
        return { step: 'Verify Person', passed: true, details: { personId: this.personId } };
      } else {
        this.logger.error('Person not found in CRM');
        this.logger.error(`Response: ${response.substring(0, 200)}`);
        return { step: 'Verify Person', passed: false, error: 'Person not found' };
      }
    } catch {
      this.logger.error('Invalid response from CRM');
      return { step: 'Verify Person', passed: false, error: 'Invalid response' };
    }
  }

  private async step3VerifyCompany(): Promise<TestResult> {
    this.logger.log('step', '3. Verifying Company creation...');

    const filter = encodeURIComponent(JSON.stringify({ name: { contains: this.testData.testId } }));
    const response = this.executor.execSilent(
      `curl -s -X GET "${this.config.twentyCrmUrl}/rest/companies" ` +
      `-H "Authorization: Bearer ${this.config.twentyToken}" ` +
      `-G --data-urlencode "filter=${filter}" 2>/dev/null || echo '{}'"
    );

    try {
      const data = JSON.parse(response);
      const company = data.data?.[0];

      if (company && response.includes(this.testData.company)) {
        this.companyId = company.id;
        this.logger.success('Company created successfully');
        this.logger.info(`Company ID: ${this.companyId}`);
        return { step: 'Verify Company', passed: true, details: { companyId: this.companyId } };
      } else {
        this.logger.error('Company not found in CRM');
        return { step: 'Verify Company', passed: false, error: 'Company not found' };
      }
    } catch {
      this.logger.error('Invalid response from CRM');
      return { step: 'Verify Company', passed: false, error: 'Invalid response' };
    }
  }

  private async step4VerifyNotes(): Promise<TestResult> {
    if (!this.personId) {
      this.logger.error('Skipping note verification - person not found');
      return { step: 'Verify Notes', passed: false, error: 'Person not found' };
    }

    this.logger.log('step', '4. Verifying Note creation...');

    const filter = encodeURIComponent(JSON.stringify({ person: { eq: this.personId } }));
    const response = this.executor.execSilent(
      `curl -s -X GET "${this.config.twentyCrmUrl}/rest/notes" ` +
      `-H "Authorization: Bearer ${this.config.twentyToken}" ` +
      `-G --data-urlencode "filter=${filter}" 2>/dev/null || echo '{"data":[]}'`
    );

    try {
      const data = JSON.parse(response);
      const notesCount = data.data?.length || 0;

      if (notesCount > 0) {
        this.noteId = data.data[0].id;
        const noteBody = data.data[0].body || '';
        this.logger.success(`Note created successfully (${notesCount} note(s))`);
        this.logger.info(`Note ID: ${this.noteId}`);

        if (noteBody.includes('Integration test submission')) {
          this.logger.success('Note contains expected message');
          return { step: 'Verify Notes', passed: true, details: { noteId: this.noteId, notesCount } };
        } else {
          this.logger.error('Note does not contain expected message');
          return { step: 'Verify Notes', passed: false, error: 'Unexpected note content' };
        }
      } else {
        this.logger.error('No notes found for person');
        return { step: 'Verify Notes', passed: false, error: 'No notes found' };
      }
    } catch {
      this.logger.error('Invalid response from CRM');
      return { step: 'Verify Notes', passed: false, error: 'Invalid response' };
    }
  }

  private async step5Cleanup(): Promise<TestResult> {
    this.logger.log('step', '5. Cleaning up test data...');

    let deleted = 0;

    // Delete person
    if (this.personId) {
      this.executor.execSilent(
        `curl -s -X DELETE "${this.config.twentyCrmUrl}/rest/people/${this.personId}" ` +
        `-H "Authorization: Bearer ${this.config.twentyToken}" 2>/dev/null`
      );
      this.logger.success('Deleted test person');
      deleted++;
    }

    // Delete company
    if (this.companyId) {
      this.executor.execSilent(
        `curl -s -X DELETE "${this.config.twentyCrmUrl}/rest/companies/${this.companyId}" ` +
        `-H "Authorization: Bearer ${this.config.twentyToken}" 2>/dev/null`
      );
      this.logger.success('Deleted test company');
      deleted++;
    }

    return { step: 'Cleanup', passed: deleted > 0, details: { deletedCount: deleted } };
  }

  private printSummary(results: TestResult[]): number {
    console.log();
    console.log('='.repeat(42));

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    if (failed === 0) {
      this.logger.success('Integration test PASSED');
      console.log('='.repeat(42));
      return 0;
    } else {
      this.logger.error('Integration test FAILED');
      console.log(`Passed: ${passed}, Failed: ${failed}`);
      console.log('='.repeat(42));
      return 1;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Main execution
const main = async (): Promise<void> => {
  const test = new IntegrationTest();
  const exitCode = await test.run();
  process.exit(exitCode);
};

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
