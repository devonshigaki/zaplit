---
title: CI/CD Operations Guide
topics:
  - CI/CD
  - GitHub Actions
  - Deployment
  - Cloud Run
---

# CI/CD Operations Guide

This guide covers the Continuous Integration and Continuous Deployment (CI/CD) setup for the Zaplit monorepo.

---

## Quick Reference

### CI Workflow Status

| Workflow | File | Trigger | Status |
|----------|------|---------|--------|
| CI | `.github/workflows/ci.yml` | PR/Push to main | Required |
| Deploy zaplit-com | `.github/workflows/deploy-zaplit-com.yml` | Push to main (zaplit-com/**) | Automatic |
| Deploy zaplit-org | `.github/workflows/deploy-zaplit-org.yml` | Push to main (zaplit-org/**) | Automatic |

### Manual Deployment

```bash
# Trigger manual deployment via GitHub CLI
github workflow run deploy-zaplit-com.yml -f environment=staging
github workflow run deploy-zaplit-org.yml -f environment=staging

# Or via web interface:
# Actions → Deploy [app] → Run workflow
```

---

## CI Workflow (ci.yml)

### Overview

The CI workflow runs on every pull request and push to `main` or `develop` branches. It ensures code quality and catches issues before deployment.

### Jobs

```
┌─────────────┐
│   changes   │  ← Detect which apps changed
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   install   │  ← Install pnpm dependencies
└──────┬──────┘
       │
       ▼
┌─────────────┬─────────────┬─────────────┐
│  typecheck  │    lint     │ unit-tests  │  ← Parallel jobs
│  (matrix)   │   (matrix)  │  (matrix)   │
└──────┬──────┴──────┬──────┴──────┬──────┘
       │             │             │
       └─────────────┼─────────────┘
                     ▼
              ┌─────────────┐
              │    build    │  ← Build both apps
              │   (matrix)  │
              └──────┬──────┘
                     │
                     ▼
              ┌─────────────┐
              │  e2e-tests  │  ← Playwright tests (conditional)
              └──────┬──────┘
                     │
                     ▼
              ┌─────────────┐
              │ ci-summary  │  ← Final status report
              └─────────────┘
```

### Job Details

#### 1. Changes Detection

Uses `dorny/paths-filter` to detect which parts of the monorepo changed:

```yaml
filters:
  zaplit-com:
    - 'zaplit-com/**'
    - 'package.json'
    - 'pnpm-lock.yaml'
  zaplit-org:
    - 'zaplit-org/**'
    - 'package.json'
    - 'pnpm-lock.yaml'
  shared:
    - '.github/workflows/**'
    - '*.config.*'
```

**Benefits:**
- Skip unnecessary jobs for unchanged apps
- Faster CI feedback
- Reduced CI minutes usage

#### 2. Install

- Sets up pnpm (version 9)
- Sets up Node.js (version 20)
- Caches `node_modules` across jobs
- Uses `--frozen-lockfile` for reproducible installs

#### 3. Type Check

Matrix job running TypeScript checks:
```bash
pnpm typecheck:com  # zaplit-com
pnpm typecheck:org  # zaplit-org
```

#### 4. Lint

Matrix job running ESLint:
```bash
pnpm lint:com  # zaplit-com: next lint
pnpm lint:org  # zaplit-org: eslint .
```

#### 5. Unit Tests

Runs Vitest tests (zaplit-com has tests configured):
```bash
pnpm test:com  # vitest run
```

**Coverage:** Reports uploaded as artifacts with 7-day retention.

#### 6. Build

Builds both Next.js applications:
```bash
pnpm build:com  # next build
pnpm build:org  # next build
```

**Caching:**
- `.next/cache` cached between builds
- Build artifacts uploaded for E2E tests

#### 7. E2E Tests (Conditional)

Runs Playwright tests with the following conditions:
- Only on PRs to `main`
- Only on push to `main`
- When commit message contains `[e2e]`
- When zaplit-com files changed

**Browsers:** Chromium (configurable for multi-browser testing)

**Artifacts:**
- Screenshots on failure
- Playwright HTML report
- Test results

### Caching Strategy

| Cache | Path | Key Strategy |
|-------|------|--------------|
| pnpm store | `~/.local/share/pnpm/store` | OS + lockfile hash |
| node_modules | `**/node_modules` | OS + lockfile hash |
| Next.js | `.next/cache` | OS + app + lockfile + source hash |
| TypeScript | `*.tsbuildinfo` | Included in source hash |

### Environment Variables

```yaml
NODE_VERSION: '20'      # Node.js version
PNPM_VERSION: '9'       # pnpm version
NEXT_TELEMETRY_DISABLED: 1  # Disable Next.js telemetry
```

---

## Deployment Workflows

### Deploy zaplit-com

**Triggers:**
- Push to `main` with changes in:
  - `zaplit-com/**`
  - `package.json`
  - `pnpm-lock.yaml`
- Manual dispatch (with environment selection)

**Process:**

```
1. Verify CI passed
2. Install dependencies
3. Build Next.js app
4. Authenticate to GCP
5. Build Docker image
6. Push to Artifact Registry
7. Deploy to Cloud Run (no traffic)
8. Run smoke tests
9. Migrate traffic to new revision
10. Rollback on failure
```

**Cloud Run Configuration:**

| Setting | Value |
|---------|-------|
| Platform | managed |
| Region | us-central1 |
| Min instances | 1 (keeps warm) |
| Max instances | 10 |
| Memory | 1Gi |
| CPU | 1 |
| Concurrency | 80 |
| Timeout | 300s |

### Deploy zaplit-org

Similar process to zaplit-com with different scaling:

| Setting | Value |
|---------|-------|
| Min instances | 0 (scale to zero) |
| Max instances | 5 |
| Memory | 512Mi |

---

## Required Secrets

### For CI

No secrets required for basic CI workflow.

### For Deployment

Configure these in GitHub Settings → Secrets and variables → Actions:

| Secret | Description | Example |
|--------|-------------|---------|
| `GCP_PROJECT_ID` | Google Cloud project ID | `my-project-123` |
| `GCP_REGION` | Cloud Run region | `us-central1` |
| `GCP_SERVICE_ACCOUNT` | Service account email | `deploy@my-project.iam.gserviceaccount.com` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Workload Identity Provider | `projects/123/locations/global/...` |

**Alternative (less secure):**
- `GCP_SA_KEY`: Service account JSON key

### Workload Identity Setup (Recommended)

1. Create service account:
```bash
gcloud iam service-accounts create github-deploy \
  --display-name="GitHub Actions Deploy"
```

2. Grant permissions:
```bash
# Cloud Run
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:github-deploy@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

# Artifact Registry
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:github-deploy@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"
```

3. Configure Workload Identity Federation:
```bash
# Create Workload Identity Pool
gcloud iam workload-identity-pools create github \
  --location="global" \
  --display-name="GitHub Actions"

# Create provider
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location="global" \
  --workload-identity-pool="github" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```

---

## Docker Configuration

### zaplit-com/Dockerfile

```dockerfile
# Multi-stage build for production
FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Dependencies stage
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# Builder stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# Production stage
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy only necessary files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

### Build Output Configuration

Add to `next.config.js`:
```javascript
module.exports = {
  output: 'standalone',  // Required for Docker
}
```

---

## Troubleshooting

### CI Issues

#### pnpm install fails
```bash
# Clear cache
rm -rf ~/.local/share/pnpm/store
pnpm store prune
```

#### Type check fails intermittently
- Check `*.tsbuildinfo` files are not in `.gitignore`
- Verify cache keys include all relevant files

#### E2E tests timeout
```yaml
# Increase timeout in workflow
timeout-minutes: 20
```

### Deployment Issues

#### "Service account does not exist"
- Verify `GCP_SERVICE_ACCOUNT` secret is set correctly
- Check service account exists in GCP IAM

#### "Permission denied" on Cloud Run
- Ensure service account has `roles/run.admin`
- Verify `roles/iam.serviceAccountUser` is granted

#### Docker build fails
```bash
# Test locally
docker build -f zaplit-com/Dockerfile zaplit-com/
```

#### Rollback failed
```bash
# Manual rollback via gcloud
gcloud run services update-traffic zaplit-com \
  --to-revisions PREVIOUS_REVISION=100 \
  --region=us-central1
```

---

## Performance Optimization

### Current Targets

| Job | Target | Current |
|-----|--------|---------|
| Install | < 30s | ~25s |
| Type Check | < 60s | ~45s |
| Lint | < 60s | ~30s |
| Unit Tests | < 120s | ~60s |
| Build | < 180s | ~120s |
| E2E Tests | < 300s | ~180s |

### Optimization Tips

1. **Use pnpm's built-in cache:**
   ```yaml
   - uses: actions/setup-node@v4
     with:
       cache: 'pnpm'
   ```

2. **Cache Next.js build:**
   ```yaml
   - uses: actions/cache@v4
     with:
       path: .next/cache
       key: ${{ runner.os }}-nextjs-${{ hashFiles('pnpm-lock.yaml') }}
   ```

3. **Parallel matrix jobs:**
   ```yaml
   strategy:
     matrix:
       app: [com, org]
   ```

4. **Conditional E2E:**
   - Skip E2E on draft PRs
   - Run only when relevant files change

---

## Security Best Practices

### GitHub Actions Security

1. **Pin action versions:**
   ```yaml
   - uses: actions/checkout@v4.1.1  # Pinned to SHA recommended
   ```

2. **Use minimal permissions:**
   ```yaml
   permissions:
     contents: read
     id-token: write  # Only for GCP auth
   ```

3. **Validate workflow inputs:**
   ```yaml
   inputs:
     environment:
       type: choice
       options: [production, staging]
   ```

### GCP Security

1. **Use Workload Identity** instead of service account keys
2. **Enable Cloud Audit Logs** for deployment tracking
3. **Set resource limits** in Cloud Run to prevent abuse
4. **Use VPC Connector** for private database access

---

## Maintenance

### Weekly

- [ ] Review CI duration trends
- [ ] Check for failed deployments
- [ ] Verify cache hit rates

### Monthly

- [ ] Update action versions (check for security updates)
- [ ] Review and rotate secrets if needed
- [ ] Analyze build times for optimization opportunities

### Quarterly

- [ ] Review deployment strategy effectiveness
- [ ] Assess new GitHub Actions features
- [ ] Security audit of workflows

---

## Related Documentation

- [deployment.md](deployment.md) - General deployment procedures
- [testing-strategy.md](testing-strategy.md) - Testing procedures
- [monitoring-setup.md](monitoring-setup.md) - Observability configuration
- GitHub Actions Docs: https://docs.github.com/en/actions
- Cloud Run Docs: https://cloud.google.com/run/docs

---

## File Locations

```
.github/
├── workflows/
│   ├── ci.yml                   # Main CI workflow
│   ├── deploy-zaplit-com.yml    # zaplit-com deployment
│   └── deploy-zaplit-org.yml    # zaplit-org deployment
docs/ops/
└── ci-cd.md                     # This documentation
```
