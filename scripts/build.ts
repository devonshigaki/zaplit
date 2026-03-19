#!/usr/bin/env ts-node
/**
 * Build script with type checking
 */
import { execSync } from 'child_process';
import { existsSync, rmSync } from 'fs';

const main = () => {
  // Clean
  if (existsSync('./.next')) {
    rmSync('./.next', { recursive: true });
  }
  
  // Type check
  execSync('tsc --noEmit', { stdio: 'inherit' });
  
  // Build
  execSync('next build', { stdio: 'inherit' });
  
  console.log('Build complete');
};

main();
