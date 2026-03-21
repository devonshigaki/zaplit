/**
 * Environment variable validation
 * Fails fast in production if required secrets are missing
 */

import { createComponentLogger } from "./logger";

const logger = createComponentLogger("env-validation");

const REQUIRED_PRODUCTION_SECRETS = [
  'N8N_WEBHOOK_SECRET',
  'IP_HASH_SALT',
  'SENTRY_DSN',
] as const;

const REQUIRED_PRODUCTION_URLS = [
  'N8N_WEBHOOK_CONSULTATION',
  'N8N_WEBHOOK_CONTACT',
] as const;

/**
 * Validate production environment variables
 * Throws error if required secrets are missing or invalid
 */
export function validateProductionEnv(): void {
  if (process.env.NODE_ENV !== 'production') {
    logger.debug("Skipping production environment validation - not in production mode");
    return;
  }

  logger.info("Validating production environment variables");

  const missing: string[] = [];

  // Check required secrets
  for (const key of REQUIRED_PRODUCTION_SECRETS) {
    const value = process.env[key];
    if (!value || value.startsWith('__SECRET')) {
      missing.push(key);
      logger.warn({ secretName: key }, "Missing or placeholder production secret");
    }
  }

  // Check required URLs
  for (const key of REQUIRED_PRODUCTION_URLS) {
    const value = process.env[key];
    if (!value || value.includes('trycloudflare.com')) {
      missing.push(`${key} (must use production URL, not Cloudflare tunnel)`);
      logger.warn({ urlName: key, value }, "Invalid or placeholder production URL");
    }
  }

  if (missing.length > 0) {
    logger.error({
      missingCount: missing.length,
      missingVariables: missing,
    }, "Production environment validation failed");

    throw new Error(
      `FATAL: Missing required production environment variables:\n` +
      missing.map(m => `  - ${m}`).join('\n') +
      `\n\nEnsure all secrets are configured in GCP Secret Manager and ` +
      `referenced in cloudbuild.yaml`
    );
  }

  // Validate IP_HASH_SALT is deterministic
  const ipHashSalt = process.env.IP_HASH_SALT;
  if (ipHashSalt && ipHashSalt.length < 32) {
    logger.error({
      saltLength: ipHashSalt.length,
      requiredLength: 32,
    }, "IP_HASH_SALT does not meet minimum length requirement");

    throw new Error(
      'FATAL: IP_HASH_SALT must be at least 32 characters for security'
    );
  }

  logger.info({
    validatedSecrets: REQUIRED_PRODUCTION_SECRETS.length,
    validatedUrls: REQUIRED_PRODUCTION_URLS.length,
  }, "Production environment validated successfully");
}

/**
 * Get environment variable with validation
 * 
 * @param name - Environment variable name
 * @returns Environment variable value
 * @throws Error if variable is not set
 */
export function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    logger.error({ variableName: name }, "Environment variable not set");
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value;
}

/**
 * Get environment variable with default value
 * 
 * @param name - Environment variable name
 * @param defaultValue - Default value if not set
 * @returns Environment variable value or default
 */
export function getEnvVarWithDefault(name: string, defaultValue: string): string {
  const value = process.env[name];
  if (!value) {
    logger.debug({ variableName: name, defaultValue }, "Using default value for environment variable");
    return defaultValue;
  }
  return value;
}

/**
 * Check if running in development mode
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Check if running in production mode
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

// Auto-validate on module load in production
if (process.env.NODE_ENV === 'production') {
  validateProductionEnv();
}
