# Configuration Cleanup Plan - Phase 7

## Executive Summary

This document outlines the consolidation of scattered configuration files across the Zaplit Next.js monorepo. The goal is to establish a single source of truth for shared configurations while maintaining app-specific overrides where necessary.

## Current State Analysis

### Root Level Configs
| Config | Status | Notes |
|--------|--------|-------|
| `package.json` | ✅ Exists | Workspace root with pnpm workspaces |
| `.eslintrc.json` | ❌ Missing | Should provide base ESLint config |
| `.prettierrc` | ❌ Missing | Should be single source of truth |
| `tsconfig.json` | ❌ Missing | Needed for root-level type checking |
| `vitest.config.ts` | ❌ Missing | Consider shared test config |

### zaplit-com/ Configs
| Config | Status | Notes |
|--------|--------|-------|
| `.eslintrc.json` | ✅ Exists | Extends `next/core-web-vitals` with custom rules |
| `.prettierrc` | ✅ Exists | Single location - should move to root |
| `next.config.mjs` | ✅ Exists | Production-grade with security headers |
| `postcss.config.mjs` | ✅ Exists | Standard Tailwind v4 config |
| `tsconfig.json` | ✅ Exists | Next.js standard config |
| `vitest.config.ts` | ✅ Exists | React testing setup with coverage |

### zaplit-org/ Configs
| Config | Status | Notes |
|--------|--------|-------|
| `.eslintrc.json` | ❌ Missing | Using `eslint .` in package.json - inconsistent |
| `.prettierrc` | ❌ Missing | No formatting config - inconsistent |
| `next.config.mjs` | ✅ Exists | Identical to zaplit-com (duplicate) |
| `postcss.config.mjs` | ✅ Exists | Identical to zaplit-com (duplicate) |
| `tsconfig.json` | ✅ Exists | Identical to zaplit-com |
| `vitest.config.ts` | ❌ Missing | No testing setup - inconsistent |

### scripts-ts/ Configs
| Config | Status | Notes |
|--------|--------|-------|
| `.eslintrc.json` | ✅ Exists | Node.js/TypeScript specific config |
| `tsconfig.json` | ✅ Exists | Node.js specific (CommonJS, ES2022) |
| `package.json` | ✅ Exists | Separate package for deployment scripts |

---

## Consolidation Strategy

### 1. ESLint Configuration

#### Create Root ESLint Base Config
**File**: `.eslintrc.json` (at root)

```json
{
  "root": true,
  "env": {
    "es2022": true,
    "node": true
  },
  "extends": [
    "eslint:recommended"
  ],
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module"
  },
  "rules": {
    "no-console": "off",
    "no-unused-vars": "off"
  },
  "overrides": [
    {
      "files": ["*.ts", "*.tsx"],
      "extends": [
        "plugin:@typescript-eslint/recommended"
      ],
      "parser": "@typescript-eslint/parser",
      "plugins": ["@typescript-eslint"],
      "rules": {
        "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
        "@typescript-eslint/no-explicit-any": "warn"
      }
    }
  ]
}
```

#### Update zaplit-com/.eslintrc.json
**Changes**: Extend root config + Next.js specific rules

```json
{
  "root": false,
  "extends": [
    "../.eslintrc.json",
    "next/core-web-vitals"
  ],
  "rules": {
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/no-explicit-any": "warn"
  }
}
```

#### Create zaplit-org/.eslintrc.json
**Changes**: NEW FILE - Match zaplit-com pattern

```json
{
  "root": false,
  "extends": [
    "../.eslintrc.json",
    "next/core-web-vitals"
  ],
  "rules": {
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/no-explicit-any": "warn"
  }
}
```

#### Keep scripts-ts/.eslintrc.json
**Decision**: Keep app-specific - Node.js scripts have different requirements
- Uses `@typescript-eslint` project reference
- Different rule set for CLI scripts (allows console, process.exit)
- References local tsconfig.json

---

### 2. Prettier Configuration

#### Create Root Prettier Config
**File**: `.prettierrc` (at root)

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

#### Delete zaplit-com/.prettierrc
**Reason**: Root config provides single source of truth

#### Create .prettierignore (at root)

```
node_modules/
.next/
dist/
*.min.js
*.min.css
coverage/
```

---

### 3. TypeScript Configuration

#### Create Root tsconfig.json
**File**: `tsconfig.json` (at root)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "composite": true,
    "declaration": true,
    "declarationMap": true
  },
  "include": [],
  "references": [
    { "path": "./zaplit-com" },
    { "path": "./zaplit-org" },
    { "path": "./scripts-ts" }
  ],
  "exclude": ["node_modules"]
}
```

#### Update zaplit-com/tsconfig.json
**Changes**: Add composite reference support

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "target": "ES6",
    "allowJs": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    },
    "composite": true
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

#### Update zaplit-org/tsconfig.json
**Changes**: Same pattern as zaplit-com

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "target": "ES6",
    "allowJs": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    },
    "composite": true
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

#### Keep scripts-ts/tsconfig.json
**Changes**: Minimal - just add reference

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

### 4. Next.js Configuration

#### Analysis
Both `zaplit-com/next.config.mjs` and `zaplit-org/next.config.mjs` are **identical**. Options:

1. **Keep separate** (recommended): Each app may diverge in future
2. **Create shared config**: Extract common parts

#### Recommendation: Keep Separate but Consistent
**Reason**: Production configs may diverge (different domains, CSP policies)

#### Update zaplit-org/next.config.mjs
**Changes**: Add JSDoc type import (matches zaplit-com)

```javascript
/** @type {import('next').NextConfig} */
// ... rest identical
```

---

### 5. PostCSS Configuration

#### Analysis
Both `postcss.config.mjs` files are **identical** standard Tailwind v4 configs.

#### Recommendation: Keep Separate
**Reason**: 
- Each app may need different PostCSS plugins in future
- Simple 6-line config - not worth consolidating
- Zero maintenance burden

---

### 6. Vitest Configuration

#### Current State
- `zaplit-com`: Has full vitest config with React, coverage, etc.
- `zaplit-org`: No vitest setup (inconsistent)
- Root: Has vitest in devDependencies (v1.3.0)

#### Issue
Version mismatch:
- Root: `vitest@^1.3.0`
- zaplit-com: `vitest@^4.1.0`

#### Option A: Create Root Vitest Config (Recommended)
**File**: `vitest.workspace.ts` (at root)

```typescript
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'zaplit-com/vitest.config.ts',
  'zaplit-org/vitest.config.ts',
]);
```

#### Option B: Per-App Vitest (Current + Add to zaplit-org)
**Create zaplit-org/vitest.config.ts**:

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
```

#### Recommendation: Option A (Workspace Mode)
- Aligns with monorepo best practices
- Single command to run all tests
- Better CI integration

---

## Summary of Changes

### Files to Create
| File | Location | Purpose |
|------|----------|---------|
| `.eslintrc.json` | Root | Base ESLint config |
| `.prettierrc` | Root | Single source of formatting |
| `.prettierignore` | Root | Exclude patterns |
| `tsconfig.json` | Root | Project references base |
| `vitest.workspace.ts` | Root | Test workspace config |
| `.eslintrc.json` | zaplit-org/ | Consistent with zaplit-com |
| `vitest.config.ts` | zaplit-org/ | Testing parity |

### Files to Update
| File | Changes |
|------|---------|
| `zaplit-com/.eslintrc.json` | Extend root config |
| `zaplit-com/tsconfig.json` | Extend root config |
| `zaplit-org/tsconfig.json` | Extend root config |
| `scripts-ts/tsconfig.json` | Extend root config |
| `package.json` (root) | Update scripts, dependencies |

### Files to Delete
| File | Reason |
|------|--------|
| `zaplit-com/.prettierrc` | Moved to root |

### Files to Keep (No Changes)
| File | Reason |
|------|--------|
| `scripts-ts/.eslintrc.json` | Node.js specific |
| `zaplit-com/next.config.mjs` | App-specific |
| `zaplit-org/next.config.mjs` | App-specific |
| `zaplit-com/postcss.config.mjs` | Standard Tailwind |
| `zaplit-org/postcss.config.mjs` | Standard Tailwind |
| `zaplit-com/vitest.config.ts` | App-specific settings |

---

## Package.json Updates

### Root package.json Changes

#### Update Scripts
```json
{
  "scripts": {
    "dev:com": "cd zaplit-com && pnpm dev",
    "dev:org": "cd zaplit-org && pnpm dev",
    "build": "pnpm build:com && pnpm build:org",
    "build:com": "cd zaplit-com && pnpm build",
    "build:org": "cd zaplit-org && pnpm build",
    "typecheck": "tsc --build",
    "typecheck:com": "tsc --build zaplit-com",
    "typecheck:org": "tsc --build zaplit-org",
    "lint": "eslint .",
    "lint:com": "cd zaplit-com && next lint",
    "lint:org": "cd zaplit-org && next lint",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "ci": "pnpm typecheck && pnpm lint && pnpm test && pnpm build"
  }
}
```

#### Update DevDependencies
```json
{
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^6.14.0",
    "@typescript-eslint/parser": "^6.14.0",
    "eslint": "^8.55.0",
    "prettier": "^3.1.0",
    "typescript": "^5.7.0",
    "vitest": "^4.1.0"
  }
}
```

### zaplit-org/package.json Changes

#### Add Scripts
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit"
  }
}
```

#### Add DevDependencies
```json
{
  "devDependencies": {
    "@vitejs/plugin-react": "^6.0.1",
    "@vitest/coverage-v8": "^4.1.0",
    "jsdom": "^29.0.0",
    "vitest": "^4.1.0"
  }
}
```

---

## Migration Checklist

### Phase 1: Root Configs
- [ ] Create `.eslintrc.json` at root
- [ ] Create `.prettierrc` at root
- [ ] Create `.prettierignore` at root
- [ ] Create `tsconfig.json` at root
- [ ] Create `vitest.workspace.ts` at root

### Phase 2: App Configs
- [ ] Update `zaplit-com/.eslintrc.json` to extend root
- [ ] Delete `zaplit-com/.prettierrc`
- [ ] Update `zaplit-com/tsconfig.json` to extend root
- [ ] Create `zaplit-org/.eslintrc.json`
- [ ] Update `zaplit-org/tsconfig.json` to extend root
- [ ] Create `zaplit-org/vitest.config.ts`

### Phase 3: Scripts Configs
- [ ] Update `scripts-ts/tsconfig.json` to extend root

### Phase 4: Package.json Updates
- [ ] Update root `package.json` scripts and deps
- [ ] Update `zaplit-org/package.json` scripts and deps

### Phase 5: Validation
- [ ] Run `pnpm install` to sync dependencies
- [ ] Run `pnpm lint` - should pass
- [ ] Run `pnpm format:check` - should pass
- [ ] Run `pnpm typecheck` - should pass
- [ ] Run `pnpm test` - should pass
- [ ] Run `pnpm build` - should pass

---

## Benefits

1. **Single Source of Truth**: Prettier, base ESLint, TypeScript references
2. **Consistency**: All apps use same base configurations
3. **Maintainability**: Changes to base configs apply everywhere
4. **IDE Support**: Root configs provide better editor integration
5. **CI/CD**: Simplified pipeline with unified commands
6. **Onboarding**: New developers understand structure immediately

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing builds | Run full validation checklist |
| IDE confusion | Ensure root configs have `"root": true` where needed |
| TypeScript composite issues | Test incremental builds |
| Version conflicts | Align all vitest versions to ^4.1.0 |

---

## Notes

- scripts-ts remains largely independent (Node.js tooling has different needs)
- Next.js configs stay per-app (production configs may diverge)
- PostCSS configs stay per-app (simple, zero maintenance)
- zaplit-org needs eslint, prettier, and vitest setup to match zaplit-com
