/**
 * Global Teardown for E2E Tests
 * 
 * Runs once after all test suites complete.
 * Used for:
 * - Cleaning up test data
 * - Stopping test servers
 * - Generating reports
 */

import { FullConfig } from '@playwright/test';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Cleaning up after E2E tests...');
  
  // Example: Clean up test artifacts older than 7 days
  const fs = await import('fs');
  const path = await import('path');
  
  const testResultsDir = path.join(process.cwd(), 'test-results');
  
  if (fs.existsSync(testResultsDir)) {
    const files = fs.readdirSync(testResultsDir);
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    
    for (const file of files) {
      const filePath = path.join(testResultsDir, file);
      const stats = fs.statSync(filePath);
      
      if (now - stats.mtimeMs > maxAge) {
        fs.rmSync(filePath, { recursive: true, force: true });
        console.log(`🗑️ Cleaned up old artifact: ${file}`);
      }
    }
  }
  
  console.log('✅ Global teardown complete');
}

export default globalTeardown;
