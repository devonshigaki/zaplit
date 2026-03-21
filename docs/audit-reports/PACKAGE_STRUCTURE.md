# Zaplit Shared Package Structure

## Overview

This document describes the complete shared package structure designed for the Zaplit monorepo. The structure eliminates duplicate code between `zaplit-com` and `zaplit-org` applications while maintaining clean separation of concerns.

## Package Structure

```
packages/
└── @zaplit/
    ├── ui/              # UI component library
    │   ├── src/
    │   │   ├── components/     # React components
    │   │   ├── styles/         # Global CSS, Tailwind
    │   │   └── index.ts        # Main exports
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── tsup.config.ts
    │
    ├── utils/           # Core utilities
    │   ├── src/
    │   │   ├── cn.ts           # Tailwind class merger
    │   │   ├── constants.ts    # Application constants
    │   │   └── index.ts
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── tsup.config.ts
    │
    ├── hooks/           # React hooks
    │   ├── src/
    │   │   ├── use-mobile.ts   # Mobile detection hook
    │   │   ├── use-toast.ts    # Toast notification hook
    │   │   ├── use-form-submission.ts
    │   │   └── index.ts
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── tsup.config.ts
    │
    ├── api/             # API utilities
    │   ├── src/
    │   │   ├── response.ts     # Standardized API responses
    │   │   └── index.ts
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── tsup.config.ts
    │
    └── forms/           # Form schemas and validation
        ├── src/
        │   ├── schemas.ts        # Zod validation schemas
        │   ├── submission.ts     # Form submission hooks
        │   └── index.ts
        ├── package.json
        ├── tsconfig.json
        └── tsup.config.ts
```

## Package Details

### @zaplit/utils

**Purpose:** Core utility functions and application constants

**Dependencies:**
- `clsx` - Conditional class merging
- `tailwind-merge` - Tailwind class deduplication

**Exports:**
```typescript
// Utilities
export { cn } from './cn'

// Constants
export { VALIDATION } from './constants'
export { RATE_LIMITS } from './constants'
export { RETRY_CONFIG } from './constants'
export { API_TIMEOUTS } from './constants'
export { UI } from './constants'
export { SECURITY } from './constants'
export { CONTENT } from './constants'
```

**Build Output:**
- `dist/index.js` / `dist/index.cjs` - Main entry
- `dist/index.d.ts` - Type definitions
- `dist/constants.js` / `dist/constants.cjs` - Separate constant export

### @zaplit/hooks

**Purpose:** Shared React hooks for common functionality

**Peer Dependencies:**
- `react` ^18.0.0 || ^19.0.0
- `react-dom` ^18.0.0 || ^19.0.0

**Exports:**
```typescript
export { useIsMobile } from './use-mobile'
export { useToast, toast } from './use-toast'
export { useFormSubmission, submitFormDirect } from './use-form-submission'
```

**Build Output:**
- Individual entry points for tree-shaking
- `dist/use-mobile.js`, `dist/use-toast.js`, etc.

### @zaplit/api

**Purpose:** Next.js API route utilities

**Peer Dependencies:**
- `next` ^14.0.0 || ^15.0.0 || ^16.0.0

**Exports:**
```typescript
export { 
  createSuccessResponse, 
  createErrorResponse,
  HttpErrors,
  addRequestIdHeader,
  REQUEST_ID_HEADER
} from './response'
```

### @zaplit/forms

**Purpose:** Form validation schemas and submission logic

**Dependencies:**
- `@zaplit/utils` - Uses VALIDATION and SECURITY constants

**Peer Dependencies:**
- `react` ^18.0.0 || ^19.0.0
- `zod` ^3.0.0

**Exports:**
```typescript
// Schemas
export { 
  contactFormSchema, 
  consultationFormSchema, 
  newsletterFormSchema,
  formTypeSchema
} from './schemas'

// Validation helpers
export { sanitizeInput, isValidEmail, isDisposableEmail } from './schemas'

// Submission
export { useFormSubmission, submitFormDirect } from './submission'
```

### @zaplit/ui

**Purpose:** Complete UI component library

**Dependencies:**
- `@zaplit/utils` - cn() function
- `@zaplit/hooks` - useToast hook
- Radix UI primitives
- class-variance-authority

**Peer Dependencies:**
- `react` ^18.0.0 || ^19.0.0
- `react-dom` ^18.0.0 || ^19.0.0
- `next` ^14.0.0 || ^15.0.0 || ^16.0.0
- `tailwindcss` ^4.0.0
- `lucide-react` ^0.500.0

**Components:**

| Component | Description | Dependencies |
|-----------|-------------|--------------|
| Alert | Callout messages | - |
| Badge | Status indicators | - |
| Button | Action buttons | @radix-ui/react-slot, cva |
| ButtonGroup | Button grouping | cva |
| Card | Content container | - |
| Dialog | Modal dialogs | @radix-ui/react-dialog |
| Field | Form field wrapper | @radix-ui/react-label |
| Form | react-hook-form integration | react-hook-form |
| Input | Text input | - |
| InputGroup | Input with addons | - |
| Label | Form labels | @radix-ui/react-label |
| Popover | Floating panels | @radix-ui/react-popover |
| Separator | Visual dividers | @radix-ui/react-separator |
| Sheet | Side panels | @radix-ui/react-dialog |
| Skeleton | Loading placeholder | - |
| Tabs | Tabbed interface | @radix-ui/react-tabs |
| Textarea | Multi-line input | - |
| Toast | Notifications | @radix-ui/react-toast |
| Toaster | Toast container | @radix-ui/react-toast |
| Tooltip | Hover tooltips | @radix-ui/react-tooltip |

## Build Configuration

### TypeScript Configuration

All packages use consistent TypeScript configuration:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

### Build Tool (tsup)

All packages use `tsup` for building:

```typescript
// tsup.config.ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: true,
  target: 'es2022',
  outDir: 'dist',
  external: ['react', 'react-dom', 'next'],
})
```

### Package Exports

All packages use conditional exports for optimal compatibility:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./styles": "./dist/styles.css"
  }
}
```

## Workspace Integration

### pnpm-workspace.yaml

```yaml
packages:
  - 'zaplit-com'
  - 'zaplit-org'
  - 'scripts-ts'
  - 'packages/@zaplit/*'
```

### Dependency Linking

Workspace packages reference each other using `workspace:*` protocol:

```json
{
  "dependencies": {
    "@zaplit/utils": "workspace:*",
    "@zaplit/hooks": "workspace:*"
  }
}
```

### Root Scripts

```json
{
  "scripts": {
    "build": "pnpm build:packages && pnpm build:apps",
    "build:packages": "pnpm --filter '@zaplit/*' build",
    "build:apps": "pnpm build:com && pnpm build:org",
    "dev:ui": "pnpm --filter @zaplit/ui dev"
  }
}
```

## Usage Examples

### In Application Code

```typescript
// Component file
import { Button, Card, Input, Label } from '@zaplit/ui'
import { useToast } from '@zaplit/hooks'
import { contactFormSchema } from '@zaplit/forms'
import { cn, VALIDATION } from '@zaplit/utils'
import { createSuccessResponse } from '@zaplit/api'

// Form component
export function ContactForm() {
  const { toast } = useToast()
  
  const onSubmit = async (data: ContactFormData) => {
    const result = await submitForm(data)
    if (result.success) {
      toast({ title: 'Message sent!' })
    }
  }
  
  return (
    <Card>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" />
          </div>
          <Button type="submit">Send</Button>
        </div>
      </form>
    </Card>
  )
}
```

### In API Routes

```typescript
// app/api/contact/route.ts
import { createSuccessResponse, createErrorResponse, HttpErrors } from '@zaplit/api'
import { contactFormSchema } from '@zaplit/forms'

export async function POST(request: Request) {
  const body = await request.json()
  
  const result = contactFormSchema.safeParse(body)
  if (!result.success) {
    return HttpErrors.BAD_REQUEST('Invalid form data', result.error.flatten())
  }
  
  // Process form...
  
  return createSuccessResponse({ id: '123' }, 201)
}
```

## Migration Status

| Phase | Package | Status | Files Migrated |
|-------|---------|--------|----------------|
| 1 | @zaplit/utils | ✅ Ready | lib/utils.ts, lib/constants.ts |
| 2 | @zaplit/hooks | ✅ Ready | hooks/use-mobile.ts, hooks/use-toast.ts |
| 3 | @zaplit/ui | ✅ Ready | components/ui/*.tsx (20+ components) |
| 4 | @zaplit/api | ✅ Ready | lib/api/response.ts |
| 5 | @zaplit/forms | ✅ Ready | lib/schemas/forms.ts, lib/form-submission.ts |

## Next Steps

1. Run `pnpm install` to link all workspace packages
2. Build packages: `pnpm build:packages`
3. Follow migration phases in MIGRATION.md
4. Test each phase thoroughly before proceeding
5. Update CI/CD to build packages before apps
