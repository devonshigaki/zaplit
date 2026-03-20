# Automation Scripts

## Overview

This document describes the TypeScript automation scripts for managing n8n and Twenty CRM infrastructure on Google Cloud Platform.

**Note**: These scripts represent a migration from shell scripts to TypeScript for improved type safety, error handling, and maintainability. The original shell scripts are preserved in `scripts/` while TypeScript versions are in `scripts-ts/`.

---

## Quick Start

```bash
cd scripts-ts
npm install

# Set required environment variables
export GCP_PROJECT_ID="zaplit-production"
export GCP_ZONE="us-central1-a"
export TWENTY_TOKEN="your-twenty-crm-api-token"

# Run a script
npm run verify:predeploy
```

---

## Script Categories

### 1. Security Scripts

#### `security:verify-encryption`
Verifies n8n security configuration including encryption key strength and basic authentication.

```bash
npm run security:verify-encryption

# Custom instance
npx ts-node src/security/verify-encryption-key.ts my-instance us-central1-b my-project
```

**Verifies:**
- N8N_ENCRYPTION_KEY is set and cryptographically strong
- Basic authentication is enabled
- Webhook HMAC secret is configured

**Exit Codes:**
- `0` - All checks passed
- `1` - General failure
- `2` - Encryption key issues
- `3` - Basic auth issues

---

#### `security:enable-auth`
Enables basic authentication for n8n with secure password generation.

```bash
npm run security:enable-auth

# Custom settings
npx ts-node src/security/enable-basic-auth.ts my-instance us-central1-b my-username my-project
```

**Features:**
- Generates cryptographically secure password
- Stores password in GCP Secret Manager
- Updates docker-compose.yml on VM
- Restarts n8n container

---

### 2. Disaster Recovery Scripts

#### `dr:backup-db`
Creates PostgreSQL backups with GCS upload and notifications.

```bash
npm run dr:backup-db
```

**Features:**
- PostgreSQL dump with compression
- Upload to GCS bucket
- Metadata generation
- Retention policy enforcement
- Slack/email notifications

**Environment Variables:**
- `SLACK_WEBHOOK_URL` - Optional Slack notifications

---

#### `dr:setup-snapshots`
Configures GCP VM snapshot schedules for automated backups.

```bash
npm run dr:setup-snapshots

# Custom VM
npx ts-node src/dr/setup-snapshots.ts my-instance us-central1-b
```

**Creates:**
- GCP snapshot schedule for VM disk
- GCS backup bucket with lifecycle policy
- Backup directories on VM
- Cron job for database backups

---

### 3. Monitoring Scripts

#### `monitoring:deploy`
Deploys Prometheus + Grafana monitoring stack.

```bash
npm run monitoring:deploy

# Auto-deploy without confirmation
npx ts-node src/monitoring/deploy-monitoring.ts --auto-deploy
```

**Deploys:**
- Prometheus (port 9090)
- Grafana (port 3000)
- Node Exporter
- Pre-configured dashboards and alerts

---

### 4. Deployment Scripts

#### `deploy:phase1`
Master orchestration script for Phase 1 stabilization deployment.

```bash
# Interactive deployment
npm run deploy:phase1

# Dry run (simulate without changes)
npm run deploy:phase1:dry-run

# Skip specific components
npx ts-node src/deploy/deploy-phase1.ts --skip-monitoring --skip-dr
```

**Options:**
- `--dry-run` - Simulate deployment without making changes
- `--skip-security` - Skip security hardening
- `--skip-dr` - Skip disaster recovery setup
- `--skip-monitoring` - Skip monitoring deployment
- `--skip-data-quality` - Skip data quality improvements

**Deploys:**
1. Security hardening (encryption, basic auth, HMAC)
2. Disaster recovery (snapshots, backups, auto-restart)
3. Monitoring (Prometheus, Grafana)
4. Data quality improvements

---

#### `deploy:circuit-breaker`
Deploys Redis and configures circuit breaker for n8n workflows.

```bash
npm run deploy:circuit-breaker

# Specific environment
npx ts-node src/deploy/deploy-circuit-breaker.ts production
```

**Environments:** `local`, `staging`, `production`

**Configures:**
- Redis installation and configuration
- Circuit breaker state management keys
- n8n configuration file generation
- Monitoring script creation

---

#### `deploy:dlq`
Deploys Dead Letter Queue infrastructure for form submissions.

```bash
npm run deploy:dlq

# Options
npx ts-node src/deploy/deploy-dlq.ts --dry-run --skip-db --skip-cron
```

**Options:**
- `--dry-run` - Validate without making changes
- `--skip-db` - Skip database table creation
- `--skip-workflows` - Skip n8n workflow import
- `--skip-cron` - Skip cron job setup
- `--archive-days N` - Archive entries older than N days (default: 30)

**Requires:**
- `DLQ_DATABASE_URL` - PostgreSQL connection string
- `N8N_WEBHOOK_URL` - Base URL for n8n webhooks
- `N8N_API_KEY` - n8n API key

---

#### `deploy:postgres-replication`
Deploys PostgreSQL primary-standby streaming replication.

```bash
npm run deploy:postgres-replication

# With options
npx ts-node src/deploy/deploy-postgres-replication.ts \
  --primary 10.0.0.2 \
  --standby 10.0.0.3 \
  --project zaplit-production \
  --gcs-bucket n8n-postgres-wal-archive
```

**Options:**
- `--primary <host>` - Primary PostgreSQL hostname/IP (required)
- `--standby <host>` - Standby PostgreSQL hostname/IP (required if --skip-vm-provision)
- `--pgbouncer <host>` - PgBouncer hostname/IP (default: primary)
- `--project <id>` - GCP project ID
- `--region <region>` - GCP region (default: us-central1)
- `--gcs-bucket <name>` - GCS bucket for WAL archives
- `--n8n-password <pwd>` - n8n database password
- `--skip-vm-provision` - Skip VM provisioning (use existing VM)
- `--skip-monitoring` - Skip monitoring setup

---

#### `deploy:migrate-parallel`
Migrates n8n workflow from v3 sequential to v4 parallel processing.

```bash
npm run deploy:migrate-parallel

# With options
npx ts-node src/deploy/migrate-to-parallel.ts \
  --dry-run \
  --webhook-v4 https://n8n.zaplit.com/webhook/consultation-v4
```

**Options:**
- `--dry-run` - Preview changes without executing
- `--skip-backup` - Skip workflow backup (not recommended)
- `--force` - Skip confirmation prompts
- `--webhook-v3 <url>` - v3 webhook URL for testing
- `--webhook-v4 <url>` - v4 webhook URL for testing
- `--n8n-url <url>` - n8n instance URL

---

### 5. Rollback Scripts

#### `rollback:phase1`
Emergency rollback for Phase 1 changes.

```bash
# Rollback all components
npm run rollback:phase1:all

# Rollback specific component
npx ts-node src/deploy/rollback-phase1.ts --component security
```

**⚠️ WARNING**: This script requires explicit confirmation and may cause downtime.

**Components:**
- `security` - Removes encryption and authentication (⚠️ INSECURE!)
- `dr` - Removes backup cron jobs and snapshot schedules
- `monitoring` - Stops Prometheus and Grafana
- `all` - Rolls back all components

---

### 6. Verification Scripts

#### `verify:predeploy`
Verifies all prerequisites before deployment.

```bash
npm run verify:predeploy
```

**Checks:**
- gcloud CLI installation
- GCP authentication
- SSH access to instance
- Instance status
- Docker and n8n status
- Disk space availability
- GCS bucket access

---

#### `verify:deployment`
Comprehensive post-deployment verification.

```bash
# Standard output
npm run verify:deployment

# JSON output for automation
npm run verify:deployment:json

# Detailed output
npx ts-node src/deploy/verify-deployment.ts --detailed
```

**Checks:**
- Connectivity (SSH, Docker, n8n version)
- Infrastructure (disk, memory, containers)
- Security (encryption, basic auth, HMAC)
- DR (snapshots, backups, cron jobs)
- Monitoring (Prometheus, Grafana, Node Exporter)
- Data quality (n8n health, CRM connectivity)

**Output Formats:**
- Standard (color-coded console output)
- JSON (`--json` flag for automation)

---

### 7. Testing Scripts

#### `test:health`
Quick health check for n8n-Twenty CRM integration.

```bash
npm run test:health
```

**Checks:**
- n8n instance health
- Twenty CRM health
- Webhook endpoint availability
- Test form submission

---

#### `test:integration`
End-to-end integration test.

```bash
export TWENTY_TOKEN=your_token
npm run test:integration
```

**Tests:**
1. Submits test form to n8n webhook
2. Verifies person creation in Twenty CRM
3. Verifies company creation
4. Verifies note creation
5. Cleans up test data

---

#### `test:verify-crm`
Verifies specific test records by prefix.

```bash
export TWENTY_TOKEN=your_token
npm run test:verify-crm TEST_1742412345
```

---

#### `test:cleanup`
Removes test records from Twenty CRM.

```bash
export TWENTY_TOKEN=your_token
npm run test:cleanup TEST_1742412345

# Dry run
npm run test:cleanup -- --dry-run TEST_1742412345
```

---

#### `test:load`
Load testing for n8n webhook.

```bash
# Default: 10 concurrent, 100 total
npm run test:load

# Custom: 20 concurrent, 500 total
npx ts-node src/tests/load-test.ts 20 500
```

**Reports:**
- Throughput metrics
- Response time statistics (min, max, avg, p95)
- Success rate
- Error breakdown

---

## Environment Variables

### Required

| Variable | Description | Scripts |
|----------|-------------|---------|
| `GCP_PROJECT_ID` | Google Cloud project ID | All deployment scripts |
| `GCP_ZONE` | GCP zone for VM operations | All deployment scripts |
| `TWENTY_TOKEN` | Twenty CRM API token | Test scripts, verification |

### Optional

| Variable | Description | Scripts |
|----------|-------------|---------|
| `SLACK_WEBHOOK_URL` | Slack webhook for notifications | Backup, deployment |
| `N8N_API_KEY` | n8n API key for workflow import | Migration, DLQ |
| `N8N_WEBHOOK_URL` | Base URL for n8n webhooks | DLQ, circuit breaker |
| `DLQ_DATABASE_URL` | PostgreSQL connection string | DLQ |
| `GRAFANA_ADMIN_PASSWORD` | Grafana admin password | Monitoring |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | General failure |
| `2` | Encryption key issues |
| `3` | Basic authentication issues |
| `4` | Configuration error |
| `5` | Network/connectivity error |

---

## Project Structure

```
scripts-ts/
├── src/
│   ├── lib/              # Shared libraries
│   │   ├── logger.ts     # Color-coded logging
│   │   ├── exec.ts       # Command execution
│   │   └── gcloud.ts     # GCP client wrapper
│   ├── security/         # Security scripts
│   ├── dr/               # Disaster recovery
│   ├── monitoring/       # Monitoring deployment
│   ├── deploy/           # Deployment scripts
│   └── tests/            # Testing scripts
├── package.json
├── tsconfig.json
└── README.md
```

---

## Development

### Building

```bash
npm run build
```

### Linting

```bash
npm run lint
npm run lint:fix
```

### Adding New Scripts

1. Create TypeScript file in appropriate `src/` subdirectory
2. Follow existing patterns using `Logger`, `CommandExecutor`, and `GCloudClient`
3. Export a main function with proper error handling
4. Add npm script to `package.json`
5. Update this documentation

---

## Troubleshooting

### Common Issues

**gcloud not authenticated**
```bash
gcloud auth login
gcloud config set project zaplit-production
```

**SSH access denied**
- Check IAP permissions
- Verify SSH keys are configured
- Ensure instance is running

**Docker not accessible on VM**
```bash
gcloud compute ssh n8n-instance --zone=us-central1-a
sudo systemctl status docker
```

**TypeScript compilation errors**
```bash
npm install
npm run build
```

---

## Migration from Shell Scripts

The TypeScript scripts are designed to be drop-in replacements for shell scripts. Key differences:

| Feature | Shell | TypeScript |
|---------|-------|------------|
| Type Safety | None | Full TypeScript |
| Error Handling | `set -e` | Try-catch blocks |
| Logging | `echo` | Structured Logger |
| Configuration | Environment variables | Environment + Interfaces |
| Dependencies | External tools | Node.js built-ins + SDK |

Original shell scripts are preserved in `scripts/` for reference and emergency fallback.

---

## See Also

- [Deployment Guide](./deployment.md)
- [Security Implementation](./security-implementation.md)
- [Testing Strategy](./testing-strategy.md)
- [Monitoring Setup](./monitoring-setup.md)
- [Runbooks](./runbooks/QUICK_REFERENCE.md)
