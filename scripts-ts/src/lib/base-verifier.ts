/**
 * Base verifier class for shared verification functionality
 */
import type { GcpClient } from './gcp.js';
import type { CheckResult } from '../types/verification.js';

export interface VerificationContext {
  instanceName: string;
  zone: string;
  projectId: string;
  n8nUrl: string;
  crmUrl?: string;
}

export abstract class BaseVerifier {
  constructor(
    protected gcp: GcpClient,
    protected context: VerificationContext
  ) {}

  abstract readonly category: string;

  abstract verify(): Promise<CheckResult[]>;

  protected async runCheck(
    name: string,
    fn: () => Promise<CheckResult>
  ): Promise<CheckResult> {
    try {
      return await fn();
    } catch (error) {
      return {
        name,
        category: this.category,
        status: 'fail',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };
    }
  }
}
