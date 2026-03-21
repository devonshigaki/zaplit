/**
 * Type definitions for verification scripts
 */

export type CheckStatus = 'pass' | 'fail' | 'warn';

export interface CheckResult {
  name: string;
  category?: string;
  status: CheckStatus;
  message: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}

export interface VerificationReport {
  summary: {
    passed: number;
    failed: number;
    warnings: number;
    total: number;
  };
  checks: CheckResult[];
  metadata: {
    instanceName: string;
    zone: string;
    projectId: string;
    startedAt: Date;
    completedAt: Date;
    duration: number;
  };
}

export interface PredeployConfig {
  instanceName: string;
  zone: string;
  projectId: string;
  n8nUrl: string;
}

export interface GcpConfig {
  projectId: string;
  zone: string;
  instanceName: string;
}
