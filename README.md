# Zaplit

> AI agent teams deployment platform

## Quick Start

```bash
# Install
cd zaplit-com && pnpm install

# Dev
pnpm dev

# Build
pnpm build
```

## Documentation

- [Architecture](./docs/architecture/)
- [Operations](./docs/ops/)
- [Development](./docs/development/)
- [Security](./docs/security/)
- [Reference](./docs/reference/)

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev:com` | Dev server (zaplit-com) |
| `pnpm dev:org` | Dev server (zaplit-org) |
| `pnpm build` | Build both |
| `pnpm typecheck` | TypeScript check |
| `pnpm lint` | Lint + Prettier |
| `pnpm test` | Unit tests |
| `pnpm test:e2e` | E2E tests |
| `pnpm deploy:com` | Deploy zaplit-com |
| `pnpm deploy:org` | Deploy zaplit-org |

## Tech Stack

- Next.js 16 + React 19
- TypeScript 5.7 (Strict)
- Tailwind CSS 4
- Google Cloud Run

## License

**© 2026 Zaplit. All Rights Reserved.**
