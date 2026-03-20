/**
 * Error types for deployment scripts
 */

export class DeploymentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean = false,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'DeploymentError';
  }
}

export class VerificationError extends DeploymentError {
  constructor(
    message: string,
    public readonly checkName: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'VERIFICATION_FAILED', false, context);
    this.name = 'VerificationError';
  }
}

export class GcpError extends DeploymentError {
  constructor(
    message: string,
    public readonly gcpError?: Error,
    context?: Record<string, unknown>
  ) {
    super(message, 'GCP_ERROR', true, { ...context, originalError: gcpError?.message });
    this.name = 'GcpError';
  }
}

export class SshError extends DeploymentError {
  constructor(
    message: string,
    public readonly sshError?: Error,
    context?: Record<string, unknown>
  ) {
    super(message, 'SSH_ERROR', true, { ...context, originalError: sshError?.message });
    this.name = 'SshError';
  }
}
