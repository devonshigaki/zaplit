# Zaplit Shared Packages

This directory contains shared packages used across Zaplit applications.

## Package Structure

```
packages/@zaplit/
├── ui/           # UI components library
├── utils/        # Utility functions (cn, constants)
├── hooks/        # React hooks
├── api/          # API utilities
└── forms/        # Form schemas and validation
```

## Packages Overview

### @zaplit/utils
Core utility functions and constants.

```typescript
import { cn, VALIDATION, UI } from '@zaplit/utils'
```

**Exports:**
- `cn` - Tailwind class merger
- `VALIDATION` - Form validation constants
- `RATE_LIMITS` - Rate limiting configuration
- `RETRY_CONFIG` - API retry configuration
- `API_TIMEOUTS` - API timeout values
- `UI` - UI/UX constants
- `SECURITY` - Security constants
- `CONTENT` - Content constants

### @zaplit/hooks
Shared React hooks.

```typescript
import { useIsMobile, useToast, toast, useFormSubmission } from '@zaplit/hooks'
```

**Exports:**
- `useIsMobile` - Mobile viewport detection
- `useToast` - Toast notification hook
- `toast` - Programmatic toast function
- `useFormSubmission` - Form submission hook

### @zaplit/api
API utilities for Next.js applications.

```typescript
import { createSuccessResponse, createErrorResponse, HttpErrors } from '@zaplit/api'
```

**Exports:**
- `createSuccessResponse` - Standardized success response
- `createErrorResponse` - Standardized error response
- `HttpErrors` - Common HTTP error helpers
- `addRequestIdHeader` - Request ID header helper

### @zaplit/forms
Form schemas and validation using Zod.

```typescript
import { contactFormSchema, consultationFormSchema, useFormSubmission } from '@zaplit/forms'
```

**Exports:**
- `contactFormSchema` - Contact form validation
- `consultationFormSchema` - Consultation form validation
- `newsletterFormSchema` - Newsletter form validation
- `sanitizeInput` - Input sanitization
- `isValidEmail` - Email validation
- `isDisposableEmail` - Disposable email detection

### @zaplit/ui
UI component library built on Radix UI.

```typescript
import { Button, Card, Dialog, Input, Label } from '@zaplit/ui'
import { useToast, Toaster } from '@zaplit/ui'
```

**Components:**
- Button, ButtonGroup
- Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction
- Input, Textarea, Label
- Dialog, Sheet, Popover, Tooltip
- Alert, Badge, Skeleton, Separator
- Tabs, Toast, Toaster
- Form, Field, InputGroup

## Development

### Building Packages

```bash
# Build all packages
pnpm --filter "@zaplit/*" build

# Build specific package
pnpm --filter @zaplit/utils build

# Watch mode for development
pnpm --filter @zaplit/utils dev
```

### Adding Dependencies

```bash
# Add dependency to a package
pnpm --filter @zaplit/ui add framer-motion

# Add dev dependency
pnpm --filter @zaplit/ui add -D @types/react
```

### Installing Workspace Dependencies

When adding a workspace package as a dependency:

```json
{
  "dependencies": {
    "@zaplit/utils": "workspace:*"
  }
}
```

Then run:
```bash
pnpm install
```

## Migration from App Code

See [MIGRATION.md](./MIGRATION.md) for detailed migration instructions.

## Best Practices

1. **Always build before testing in apps** - Packages must be built before changes are visible in consuming applications
2. **Use TypeScript strict mode** - All packages have strict TypeScript configuration
3. **Export types explicitly** - Type exports should be explicit for better IDE support
4. **Document with JSDoc** - All public APIs should have JSDoc comments
5. **Minimize peer dependencies** - Keep peer dependencies minimal to avoid version conflicts
