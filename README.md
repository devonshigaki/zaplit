# Zaplit

> AI agent teams deployment platform

## Quick Start

```bash
# Install
pnpm install

# Dev
pnpm dev:com    # zaplit-com (localhost:3000)
pnpm dev:org    # zaplit-org (localhost:3001)

# Build
pnpm build
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev:com` | Dev server (zaplit-com) |
| `pnpm dev:org` | Dev server (zaplit-org) |
| `pnpm build` | Build both apps |
| `pnpm typecheck` | TypeScript check |
| `pnpm lint` | Lint + Prettier |
| `pnpm test` | Unit tests |
| `pnpm test:e2e` | E2E tests |
| `pnpm deploy:com` | Deploy zaplit-com |
| `pnpm deploy:org` | Deploy zaplit-org |

## Stack

- Next.js 16 + React 19
- TypeScript 5.7 (Strict)
- Tailwind CSS 4
- Google Cloud Run

## Docs

- [Architecture](./docs/architecture/)
- [Operations](./docs/ops/)
- [Development](./docs/development/)
- [Security](./docs/security/)
- [Reference](./docs/reference/)

## License

**© 2026 Zaplit. All Rights Reserved.**
