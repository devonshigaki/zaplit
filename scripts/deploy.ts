#!/usr/bin/env ts-node
import { execSync } from 'child_process';

const main = () => {
  const app = process.argv[2];
  
  if (!app || !['com', 'org'].includes(app)) {
    console.error('Usage: ts-node scripts/deploy.ts <com|org>');
    process.exit(1);
  }
  
  const service = `zaplit-${app}`;
  const project = process.env.GCP_PROJECT || 'zaplit-website-prod';
  
  console.log(`🚀 Deploying ${service}...`);
  
  // Build
  execSync(`ts-node scripts/build.ts ${app}`, { stdio: 'inherit' });
  
  // Tag image
  console.log('  → Tagging image...');
  execSync(
    `docker build -t gcr.io/${project}/${service}:latest ./${service}`,
    { stdio: 'inherit' }
  );
  
  // Push
  console.log('  → Pushing to GCR...');
  execSync(`docker push gcr.io/${project}/${service}:latest`, { stdio: 'inherit' });
  
  // Deploy
  console.log('  → Deploying to Cloud Run...');
  execSync(
    `gcloud run deploy ${service} ` +
    `--image=gcr.io/${project}/${service}:latest ` +
    `--region=us-central1 --platform=managed ` +
    `--allow-unauthenticated`,
    { stdio: 'inherit' }
  );
  
  console.log('✅ Deployment complete');
};

main();
