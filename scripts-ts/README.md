# Zaplit Scripts TypeScript

TypeScript port of deployment and maintenance scripts for n8n and Twenty CRM infrastructure on Google Cloud Platform.

## Overview

This project provides TypeScript implementations of shell scripts for managing:
- **Security**: Encryption key verification, basic authentication setup
- **Disaster Recovery**: Database backups, VM snapshot scheduling
- **Monitoring**: Prometheus + Grafana deployment
- **Testing**: Health checks, integration tests, load testing

## Prerequisites

- Node.js 18+ 
- Google Cloud SDK (`gcloud` CLI)
- Docker (for local testing)
- Access to GCP project with appropriate permissions

## Installation

```bash
cd scripts-ts
npm install
```

## Configuration

Set environment variables:

```bash
export GCP_PROJECT_ID="zaplit-production"
export GCP_ZONE="us-central1-a"
export TWENTY_TOKEN="your-twenty-crm-api-token"
export SLACK_WEBHOOK_URL="optional-slack-webhook-for-notifications"
```

## Usage

### Security Scripts

#### Verify Encryption Key
```bash
# Default instance
npm run security:verify-encryption

# Custom instance
npx ts-node src/security/verify-encryption-key.ts my-instance us-central1-b my-project
```

Verifies:
- N8N_ENCRYPTION_KEY is set and strong
- Basic authentication is enabled
- Webhook HMAC secret is configured

#### Enable Basic Authentication
```bash
# Default settings
npm run security:enable-auth

# Custom settings
npx ts-node src/security/enable-basic-auth.ts my-instance us-central1-b my-username my-project
```

Features:
- Generates secure password
- Stores password in GCP Secret Manager
- Updates docker-compose.yml on VM
- Restarts n8n container

### Disaster Recovery Scripts

#### Database Backup
```bash
# Run backup
npm run dr:backup-db

# With custom config
TWENTY_TOKEN=xxx npx ts-node src/dr/backup-database.ts
```

Features:
- PostgreSQL dump with compression
- Upload to GCS bucket
- Metadata generation
- Retention policy enforcement
- Slack/email notifications

#### Setup Snapshot Schedule
```bash
# Default VM
npm run dr:setup-snapshots

# Custom VM
npx ts-node src/dr/setup-snapshots.ts my-instance us-central1-b
```

Creates:
- GCP snapshot schedule for VM disk
- GCS backup bucket with lifecycle policy
- Backup directories on VM

### Monitoring Scripts

#### Deploy Monitoring Stack
```bash
# Interactive mode
npm run monitoring:deploy

# Auto-deploy
npx ts-node src/monitoring/deploy-monitoring.ts --auto-deploy
```

Deploys:
- Prometheus (port 9090)
- Grafana (port 3000)
- Node Exporter
- Pre-configured dashboards and alerts

### Test Scripts

#### Health Check
```bash
npm run test:health
```

Checks:
- n8n instance health
- Twenty CRM health
- Webhook endpoint availability
- Test form submission

#### Integration Test
```bash
# Requires TWENTY_TOKEN
export TWENTY_TOKEN=your_token
npm run test:integration
```

End-to-end test:
- Submits test form to n8n webhook
- Verifies person creation in Twenty CRM
- Verifies company creation
- Verifies note creation
- Cleans up test data

#### Verify CRM Records
```bash
export TWENTY_TOKEN=your_token
npm run test:verify-crm TEST_1742412345
```

Verifies specific test records by prefix.

#### Cleanup Test Data
```bash
export TWENTY_TOKEN=your_token
npm run test:cleanup TEST_1742412345

# Dry run
npm run test:cleanup -- --dry-run TEST_1742412345
```

Removes test records from Twenty CRM.

#### Load Test
```bash
# Default: 10 concurrent, 100 total
npm run test:load

# Custom: 20 concurrent, 500 total
npx ts-node src/tests/load-test.ts 20 500
```

Generates load test report with:
- Throughput metrics
- Response time statistics (min, max, avg, p95)
- Success rate
- Error breakdown

## Project Structure

```
scripts-ts/
├── src/
│   ├── lib/
│   │   ├── logger.ts         # Shared logging utilities
│   │   ├── exec.ts           # Command execution utilities
│   │   └── gcloud.ts         # Google Cloud client wrapper
│   ├── security/
│   │   ├── verify-encryption-key.ts
│   │   └── enable-basic-auth.ts
│   ├── dr/
│   │   ├── backup-database.ts
│   │   └── setup-snapshots.ts
│   ├── monitoring/
│   │   └── deploy-monitoring.ts
│   └── tests/
│       ├── health-check.ts
│       ├── run-integration-test.ts
│       ├── verify-crm-records.ts
│       ├── cleanup-test-data.ts
│       └── load-test.ts
├── package.json
├── tsconfig.json
└── README.md
```

## Type Safety

All scripts include:
- Full TypeScript type definitions
- Interface definitions for configurations
- Proper error handling
- Input validation

## Error Handling

Scripts use consistent error handling:
- Try-catch blocks for async operations
- Exit codes: 0 (success), 1+ (failure)
- Detailed error messages
- Graceful cleanup on interruption (SIGINT/SIGTERM)

## Logging

Color-coded output with structured logging:
- `[INFO]` - Blue informational messages
- `[PASS]` - Green success messages
- `[FAIL]` - Red error messages
- `[WARN]` - Yellow warning messages

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General failure |
| 2 | Encryption key issues |
| 3 | Basic auth issues |

## Development

### Build
```bash
npm run build
```

### Lint
```bash
npm run lint
npm run lint:fix
```

### Adding New Scripts

1. Create TypeScript file in appropriate `src/` subdirectory
2. Follow existing patterns:
   - Use `Logger` for output
   - Use `CommandExecutor` for shell commands
   - Use `GCloudClient` for GCP operations
3. Export a main function
4. Add npm script to package.json
5. Update README.md

## Differences from Shell Scripts

| Feature | Shell | TypeScript |
|---------|-------|------------|
| Type Safety | None | Full |
| Error Handling | `set -e` | Try-catch |
| Logging | Echo | Structured Logger |
| Configuration | Environment | Environment + Types |
| Dependencies | External tools | Node.js built-ins + GCP SDK |

## Security Considerations

- Secrets stored in GCP Secret Manager
- No hardcoded credentials
- Passwords generated with crypto-secure random
- Backup files have restricted permissions (600)

## License

MIT

## See Also

- Original shell scripts: `../scripts/`
- Infrastructure documentation: `../README.md`
