# Development

## Setup

```bash
# Clone repo
git clone <repo-url>
cd zaplit

# Install dependencies
pnpm install

# Start dev servers
pnpm dev:com  # http://localhost:3000
pnpm dev:org  # http://localhost:3001
```

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript 5.7 (Strict mode)
- **Styling**: Tailwind CSS 4
- **Testing**: Vitest (unit), Playwright (E2E)
- **Linting**: ESLint + Prettier

## Code Standards

### TypeScript
- Strict mode enabled
- No `any` types
- Explicit return types on exports

### Components
- Server Components by default
- `'use client'` only when needed
- Props interface always defined

### Forms
- Zod validation schemas
- Server Actions for submission
- Error handling with user feedback

## Testing

```bash
pnpm test        # Unit tests
pnpm test:e2e    # E2E tests
pnpm test:ui     # Vitest UI
```

## Git Workflow

1. Create feature branch: `git checkout -b feature/name`
2. Make changes, commit with conventional commits
3. Push and create PR
4. Merge to main triggers deployment

## Environment Variables

Copy `.env.example` to `.env.local`:

```bash
# n8n
N8N_WEBHOOK_SECRET=...
N8N_WEBHOOK_CONSULTATION=...
N8N_WEBHOOK_CONTACT=...

# Twenty CRM
TWENTY_BASE_URL=...
TWENTY_API_KEY=...

# App
APP_SECRET=...
```

Production secrets are in Google Secret Manager.
