# Zaplit Monorepo - Agent Context

This file provides essential context for AI agents working on the Zaplit codebase.

## Project Overview

**Zaplit** is a Next.js-based website platform with two deployments:
- `zaplit-com` - Business/enterprise market
- `zaplit-org` - Nonprofit market

Both sites share 95%+ identical code with only content/branding differences.

## Technology Stack

- **Framework:** Next.js 16 (App Router)
- **Runtime:** React 19
- **Language:** TypeScript 5.7 (strict mode)
- **Styling:** Tailwind CSS 4
- **Components:** shadcn/ui + Radix UI
- **Testing:** Vitest + React Testing Library
- **Package Manager:** pnpm (workspaces)
- **Deployment:** Google Cloud Run (Docker)

## Monorepo Structure

```
zaplit/
├── zaplit-com/           # Business website
├── zaplit-org/           # Nonprofit website
├── scripts-ts/           # TypeScript deployment scripts
├── docs/                 # Documentation
├── runbooks/             # Operational runbooks
├── workflows/            # n8n workflow files
├── monitoring/           # Grafana/Loki configs
└── security-implementation/  # Security scripts
```

## Essential Commands

```bash
# Development
pnpm dev:com          # Start zaplit-com dev server
pnpm dev:org          # Start zaplit-org dev server

# Building
pnpm build            # Build both apps
pnpm build:com        # Build zaplit-com only
pnpm build:org        # Build zaplit-org only

# Quality Checks
pnpm typecheck        # TypeScript check all packages
pnpm lint             # ESLint check all packages
pnpm test             # Run tests for both apps

# Maintenance
pnpm clean            # Clean node_modules and build artifacts
```

## Code Conventions

### TypeScript
- **Strict mode enabled** - No `any` types allowed
- Explicit function return types on exports
- Use Zod for runtime validation
- Prefer `unknown` over `any` for error handling

### Imports
- Use `@/` alias for internal imports
- Add `.js` extension for ESM imports in scripts-ts
- Group imports: React/Next → External → Internal → Types

### Components
- Server components by default
- Use `'use client'` directive only when needed
- Props interfaces named `{ComponentName}Props`
- Compound component pattern for complex UI

### API Routes
- Use standardized response helpers from `@/lib/api/response`
- Implement rate limiting on all mutation endpoints
- Hash PII (emails, IPs) before logging
- Return structured error responses with codes

### Styling
- Tailwind CSS utility classes
- Use `cn()` helper for conditional classes
- Mobile-first responsive design
- Support `prefers-reduced-motion`

## Environment Variables

Required in production:
```bash
# API/Webhooks
N8N_WEBHOOK_URL_CONTACT=
N8N_WEBHOOK_URL_DEMO=
N8N_WEBHOOK_URL_NEWSLETTER=
N8N_WEBHOOK_SECRET=

# Security
IP_HASH_SALT=
NEXT_PUBLIC_LOGO_TOKEN=

# Optional
REDIS_URL=              # For distributed rate limiting
SENTRY_DSN=             # For error tracking
```

## Security Guidelines

1. **Never commit secrets** - Use environment variables
2. **Hash PII before logging** - Use `hashEmail()` and `hashIP()`
3. **Validate all inputs** - Zod schemas for forms
4. **Rate limit mutations** - 5 req/min per IP default
5. **Sanitize outputs** - Remove `<>` characters from user input
6. **CSP headers** - Already configured in next.config.mjs

## Testing

- Unit tests in `lib/*.test.ts` files
- Run with `pnpm test`
- Vitest + React Testing Library + jest-dom
- Mock Next.js navigation and headers

## Common Issues & Solutions

### Build Fails with Type Error
```bash
pnpm typecheck:com    # Check specific app
pnpm typecheck:org
```

### Dependency Issues
```bash
pnpm clean
pnpm install
```

### Scripts-ts Module Errors
- Ensure `"type": "module"` is in scripts-ts/package.json
- Use `.js` extensions in ESM imports

## Key Files Reference

| Purpose | Location |
|---------|----------|
| Form submission API | `app/api/submit-form/route.ts` |
| Health checks | `app/api/health/route.ts` |
| Form schemas | `lib/schemas/forms.ts` |
| API responses | `lib/api/response.ts` |
| Environment validation | `lib/env.ts` |
| UI components | `components/ui/*.tsx` |
| Custom hooks | `hooks/*.ts` |

## Deployment

1. Docker images built from each app's Dockerfile
2. Pushed to Google Container Registry
3. Deployed to Cloud Run
4. Health checks at `/api/health`

## Documentation

- `/docs` - Comprehensive documentation
- `/runbooks` - Operational procedures
- `CHANGELOG.md` - Version history
- `CONTRIBUTING.md` - Contribution guidelines

## Agent Notes

- **Code duplication is intentional** - Shared package extraction planned for v3.0.0
- **scripts-ts has type issues** - Dev-only, non-blocking for production
- **Both apps must be kept in sync** - Changes to shared files need manual sync
- **Security is critical** - Always verify security implications of changes
