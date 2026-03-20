/**
 * Type definitions for deployment scripts
 */

export type DeploymentPhase =
  | 'prerequisites'
  | 'security'
  | 'dr'
  | 'monitoring'
  | 'data_quality'
  | 'post_deployment';

export type DeploymentStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'dry_run'
  | 'manual_required'
  | 'rolling_back'
  | 'rolled_back';

export type RollbackComponent = 'security' | 'dr' | 'monitoring' | 'all';

export interface DeploymentConfig {
  instanceName: string;
  zone: string;
  projectId: string;
  n8nUrl: string;
  crmUrl: string;

  // Skip flags
  skipSecurity: boolean;
  skipDr: boolean;
  skipMonitoring: boolean;
  skipDataQuality: boolean;

  // Execution mode
  dryRun: boolean;
  autoRollback: boolean;
  force: boolean;
  interactive: boolean;

  // External dependencies
  grafanaAdminPassword?: string;
  slackWebhookUrl?: string;
  n8nBasicAuthUser?: string;
}

export interface PhaseOptions {
  critical?: boolean;
  supportsRollback?: boolean;
  manualStepsRequired?: boolean;
  maxRetries?: number;
}

export interface DeploymentStep {
  id: string;
  phase: DeploymentPhase;
  name: string;
  status: DeploymentStatus;
  startedAt?: Date;
  completedAt?: Date;
  error?: Error;
  logs: string[];
}

export interface DeploymentReport {
  status: 'success' | 'partial' | 'failed' | 'rolled_back';
  phases: Record<string, {
    status: DeploymentStatus;
    steps: DeploymentStep[];
    duration: number;
  }>;
  summary: {
    totalPhases: number;
    completed: number;
    failed: number;
    skipped: number;
  };
  metadata: {
    startedAt: Date;
    completedAt: Date;
    duration: number;
    dryRun: boolean;
  };
}

export interface RollbackOptions {
  components: RollbackComponent[];
  dryRun: boolean;
  force: boolean;
  interactive: boolean;
}

export interface RollbackContext {
  instanceName: string;
  zone: string;
  projectId: string;
  backupTimestamp: string;
  options: RollbackOptions;
}

export interface RollbackResult {
  success: boolean;
  component: RollbackComponent;
  duration: number;
  changes: ChangeRecord[];
  error?: Error;
}

export interface ChangeRecord {
  id: string;
  timestamp: Date;
  component: RollbackComponent;
  action: string;
  targetPath: string;
  backupPath?: string;
  metadata: {
    previousValue?: string;
    newValue?: string;
    checksums?: {
      before: string;
      after: string;
    };
  };
}

export interface RollbackReport {
  cancelled?: boolean;
  success: boolean;
  results: RollbackResult[];
  duration: number;
}
