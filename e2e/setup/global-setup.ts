/**
 * Global Setup for E2E Tests
 * 
 * Runs once before all test suites.
 * Used for:
 * - Starting test servers
 * - Setting up test databases
 * - Configuring global mocks
 */

import { FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting E2E test suite...');
  
  // You can add global setup here if needed:
  // - Start a mock server
  // - Seed test data
  // - Configure global environment variables
  
  // Example: Verify test environment
  const baseURL = config.projects[0]?.use?.baseURL;
  console.log(`📍 Base URL: ${baseURL}`);
  
  // Example: Set up test artifacts directory
  const fs = await import('fs');
  const path = await import('path');
  const testResultsDir = path.join(process.cwd(), 'test-results');
  
  if (!fs.existsSync(testResultsDir)) {
    fs.mkdirSync(testResultsDir, { recursive: true });
  }
  
  // Create subdirectories for artifacts
  const screenshotsDir = path.join(testResultsDir, 'screenshots');
  const videosDir = path.join(testResultsDir, 'videos');
  const tracesDir = path.join(testResultsDir, 'traces');
  
  [screenshotsDir, videosDir, tracesDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
  
  console.log('✅ Global setup complete');
}

export default globalSetup;
