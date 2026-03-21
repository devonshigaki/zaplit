/**
 * Application constants
 * 
 * Centralized location for magic numbers and configuration values
 * to improve maintainability and enable easy adjustments.
 */

/**
 * Form validation constraints
 */
export const VALIDATION = {
  /** Minimum length for name fields (first + last name) */
  MIN_NAME_LENGTH: 2,
  
  /** Minimum length for message/description fields */
  MIN_MESSAGE_LENGTH: 10,
  
  /** Maximum length for any text input (prevents abuse) */
  MAX_INPUT_LENGTH: 1000,
  
  /** Maximum length for email addresses (RFC compliant) */
  MAX_EMAIL_LENGTH: 254,
  
  /** Valid email format pattern */
  EMAIL_PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
} as const;

/**
 * Rate limiting configuration
 */
export const RATE_LIMITS = {
  /** Maximum requests allowed per window */
  MAX_REQUESTS_PER_WINDOW: 5,
  
  /** Time window in milliseconds (1 minute) */
  WINDOW_MS: 60 * 1000,
  
  /** Retry-After header value in seconds */
  RETRY_AFTER_SECONDS: 60,
} as const;

/**
 * Retry configuration for external API calls
 */
export const RETRY_CONFIG = {
  /** Maximum number of retry attempts */
  MAX_ATTEMPTS: 3,
  
  /** Base delay between retries in milliseconds */
  BASE_DELAY_MS: 1000,
  
  /** Exponential backoff multiplier */
  BACKOFF_MULTIPLIER: 2,
} as const;

/**
 * External API timeouts
 */
export const API_TIMEOUTS = {
  /** n8n webhook timeout in milliseconds (10 seconds) */
  N8N_WEBHOOK_MS: 10000,
  
  /** General API call timeout */
  DEFAULT_API_MS: 30000,
} as const;

/**
 * UI/UX constants
 */
export const UI = {
  /** Mobile breakpoint in pixels (matches Tailwind md breakpoint) */
  MOBILE_BREAKPOINT_PX: 768,
  
  /** Toast notification duration in milliseconds */
  TOAST_DURATION_MS: 5000,
  
  /** Maximum number of toasts shown simultaneously */
  MAX_TOASTS: 1,
  
  /** Animation duration in milliseconds */
  ANIMATION_DURATION_MS: 200,
} as const;

/**
 * Security constants
 */
export const SECURITY = {
  /** Characters to strip from user input (basic XSS prevention) */
  XSS_STRIP_PATTERN: /[<>]/g,
  
  /** Hash algorithm for PII */
  HASH_ALGORITHM: 'sha256',
  
  /** Maximum request body size in bytes (1MB) */
  MAX_BODY_SIZE_BYTES: 1024 * 1024,
} as const;

/**
 * Content constants
 */
export const CONTENT = {
  /** Default meta description length for SEO */
  META_DESCRIPTION_MAX_LENGTH: 160,
  
  /** Default OG image dimensions */
  OG_IMAGE_WIDTH: 1200,
  OG_IMAGE_HEIGHT: 630,
} as const;
