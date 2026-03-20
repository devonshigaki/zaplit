# Changelog

All notable changes to this project.

## [1.0.1] - 2026-03-20

### Fixed
- Added missing `typecheck` scripts to zaplit-com, zaplit-org, and scripts-ts packages
- Fixed root ESLint configuration (removed invalid `next/core-web-vitals` preset)
- Aligned TypeScript targets to ES2022 across all packages

### Added
- Added `format` and `format:check` scripts to zaplit-com and zaplit-org

## [1.0.0] - 2026-03-19

### Added
- Initial release with zaplit-com and zaplit-org
- Next.js 16 with App Router
- Form submissions via n8n webhooks
- Twenty CRM integration
- Google Cloud Run deployment
- Comprehensive test suite (Vitest + Playwright)

### Infrastructure
- Google Cloud Run containerization
- Cloud Build CI/CD
- Secret Manager for env vars
- Domain mapping for zaplit.com, zaplit.org

---

**© 2026 Zaplit. All Rights Reserved.**
