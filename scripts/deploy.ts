#!/usr/bin/env ts-node
/**
 * Deploy script for zaplit-com and zaplit-org to Google Cloud Run
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface DeployOptions {
  service: 'zaplit-com' | 'zaplit-org';
  project?: string;
  region?: string;
  skipTests?: boolean;
}

const deploy = async (options: DeployOptions): Promise<void> => {
  const { 
    service, 
    project = 'zaplit-website-prod', 
    region = 'us-central1',
    skipTests = false
  } = options;
  
  const serviceDir = path.resolve(__dirname, '..', service);
  
  if (!fs.existsSync(serviceDir)) {
    console.error(`Service not found: ${serviceDir}`);
    process.exit(1);
  }
  
  console.log(`Deploying ${service}...`);
  
  if (!skipTests) {
    console.log('Running checks...');
    execSync('pnpm typecheck', { cwd: serviceDir, stdio: 'inherit' });
    execSync('pnpm lint', { cwd: serviceDir, stdio: 'inherit' });
  }
  
  console.log('Building container...');
  execSync(
    `gcloud builds submit --tag gcr.io/${project}/${service} ${serviceDir}`,
    { stdio: 'inherit' }
  );
  
  console.log('Deploying to Cloud Run...');
  const deployCmd = [
    'gcloud run deploy', service,
    `--image gcr.io/${project}/${service}`,
    '--platform managed',
    `--region ${region}`,
    '--allow-unauthenticated',
    `--project ${project}`,
    '--set-env-vars="NODE_ENV=production"'
  ];
  
  if (service === 'zaplit-com') {
    deployCmd.push(
      '--set-secrets="N8N_WEBHOOK_CONSULTATION=n8n-webhook-consultation:latest,N8N_WEBHOOK_CONTACT=n8n-webhook-contact:latest,N8N_WEBHOOK_SECRET=n8n-webhook-secret:latest"'
    );
  }
  
  execSync(deployCmd.join(' '), { stdio: 'inherit' });
  
  console.log(`${service} deployed successfully!`);
};

const service = process.argv[2] as 'zaplit-com' | 'zaplit-org';

if (!service || !['zaplit-com', 'zaplit-org'].includes(service)) {
  console.error('Usage: ts-node scripts/deploy.ts <zaplit-com|zaplit-org>');
  process.exit(1);
}

deploy({ service }).catch((err) => {
  console.error('Deployment failed:', err);
  process.exit(1);
});
