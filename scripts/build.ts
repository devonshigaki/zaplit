#!/usr/bin/env ts-node
import { execSync } from 'child_process';
import { existsSync, rmSync } from 'fs';

const main = () => {
  const app = process.argv[2] || 'com';
  
  console.log(`🔨 Building zaplit-${app}...`);
  
  // Clean
  const outDir = app === 'com' ? './zaplit-com/.next' : './zaplit-org/.next';
  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true });
    console.log('  ✓ Cleaned .next');
  }
  
  // Type check
  console.log('  → Type checking...');
  const cwd = app === 'com' ? './zaplit-com' : './zaplit-org';
  execSync('tsc --noEmit', { stdio: 'inherit', cwd });
  
  // Build
  console.log('  → Building...');
  execSync('next build', { stdio: 'inherit', cwd });
  
  console.log('✅ Build complete');
};

main();
