# Package Migration Guide

This guide provides step-by-step instructions for migrating duplicate code from `zaplit-com` and `zaplit-org` to the shared packages.

## Migration Phases

### Phase 1: Utils Package (Lowest Risk)
**Estimated Time:** 30 minutes
**Risk Level:** Low

The utils package has no dependencies on other code, making it the safest starting point.

#### Steps:

1. **Install the package in apps:**
   ```bash
   # In zaplit-com
   cd /Users/devonshigaki/Developer/zaplit/zaplit-com
   pnpm add @zaplit/utils@workspace:*

   # In zaplit-org
   cd /Users/devonshigaki/Developer/zaplit/zaplit-org
   pnpm add @zaplit/utils@workspace:*
   ```

2. **Update imports in zaplit-com:**
   ```typescript
   // Before
   import { cn } from '@/lib/utils'
   import { VALIDATION } from '@/lib/constants'

   // After
   import { cn, VALIDATION } from '@zaplit/utils'
   ```

3. **Update imports in zaplit-org:**
   ```typescript
   // Same changes as zaplit-com
   import { cn, VALIDATION } from '@zaplit/utils'
   ```

4. **Remove duplicate files:**
   ```bash
   rm zaplit-com/lib/utils.ts
   rm zaplit-com/lib/constants.ts
   rm zaplit-org/lib/utils.ts
   rm zaplit-org/lib/constants.ts
   ```

5. **Update tsconfig.json path aliases (optional):**
   If you want to keep using `@/lib/utils` during transition:
   ```json
   {
     "compilerOptions": {
       "paths": {
         "@/lib/utils": ["../../packages/@zaplit/utils/src"]
       }
     }
   }
   ```

### Phase 2: Hooks Package
**Estimated Time:** 45 minutes
**Risk Level:** Low-Medium

#### Steps:

1. **Install the package:**
   ```bash
   pnpm add @zaplit/hooks@workspace:*
   ```

2. **Update imports:**
   ```typescript
   // Before
   import { useIsMobile } from '@/hooks/use-mobile'
   import { useToast, toast } from '@/hooks/use-toast'

   // After
   import { useIsMobile, useToast, toast } from '@zaplit/hooks'
   ```

3. **Handle toast component dependency:**
   The `use-toast.ts` file references `ToastActionElement` and `ToastProps` from `@/components/ui/toast`.
   
   **Option A:** Import these types from @zaplit/ui after Phase 3
   **Option B:** Keep a local use-toast.ts that re-exports from @zaplit/hooks with the type imports
   
   Recommended temporary approach:
   ```typescript
   // hooks/use-toast.ts (local re-export)
   export { useToast, toast, reducer } from '@zaplit/hooks'
   export type { ToastActionElement, ToastProps } from '@/components/ui/toast'
   ```

4. **Remove duplicate hook files:**
   ```bash
   rm zaplit-com/hooks/use-mobile.ts
   rm zaplit-com/hooks/use-toast.ts
   rm zaplit-org/hooks/use-mobile.ts
   rm zaplit-org/hooks/use-toast.ts
   ```

### Phase 3: UI Components Package
**Estimated Time:** 1-2 hours
**Risk Level:** Medium

This phase requires careful testing as UI components are heavily used.

#### Steps:

1. **Install the package:**
   ```bash
   pnpm add @zaplit/ui@workspace:*
   ```

2. **Update component imports:**
   ```typescript
   // Before
   import { Button } from '@/components/ui/button'
   import { Card, CardHeader, CardTitle } from '@/components/ui/card'

   // After
   import { Button } from '@zaplit/ui'
   import { Card, CardHeader, CardTitle } from '@zaplit/ui'
   ```

3. **Bulk update using find/replace:**
   ```bash
   # Update all imports in zaplit-com
   find zaplit-com -type f -name "*.tsx" -exec sed -i '' \
     's|from "@/components/ui/\([^"]*\)"|from "@zaplit/ui"|g' {} \;
   ```

4. **Handle edge cases:**
   Some components may have app-specific modifications. Review each:
   - `background-boxes.tsx` - Keep in app if it's app-specific
   - `form.tsx` - May need react-hook-form dependency alignment

5. **Remove duplicate component files:**
   ```bash
   rm -rf zaplit-com/components/ui
   rm -rf zaplit-org/components/ui
   ```

6. **Update Tailwind config:**
   Ensure apps can access the UI package's CSS classes:
   ```css
   /* In app/globals.css */
   @import '@zaplit/ui/styles';
   ```

### Phase 4: API Utilities
**Estimated Time:** 30 minutes
**Risk Level:** Low

#### Steps:

1. **Install the package:**
   ```bash
   pnpm add @zaplit/api@workspace:*
   ```

2. **Update API route imports:**
   ```typescript
   // Before
   import { createSuccessResponse, createErrorResponse } from '@/lib/api/response'

   // After
   import { createSuccessResponse, createErrorResponse } from '@zaplit/api'
   ```

3. **Remove duplicate API utility files:**
   ```bash
   rm zaplit-com/lib/api/response.ts
   rm zaplit-org/lib/api/response.ts
   ```

### Phase 5: Forms Package
**Estimated Time:** 45 minutes
**Risk Level:** Medium

#### Steps:

1. **Install the package:**
   ```bash
   pnpm add @zaplit/forms@workspace:*
   ```

2. **Update form imports:**
   ```typescript
   // Before
   import { contactFormSchema } from '@/lib/schemas/forms'
   import { useFormSubmission } from '@/lib/form-submission'

   // After
   import { contactFormSchema, useFormSubmission } from '@zaplit/forms'
   ```

3. **Remove duplicate form files:**
   ```bash
   rm zaplit-com/lib/schemas/forms.ts
   rm zaplit-com/lib/form-submission.ts
   rm zaplit-org/lib/schemas/forms.ts
   rm zaplit-org/lib/form-submission.ts
   ```

## Post-Migration Checklist

- [ ] All TypeScript builds pass (`pnpm typecheck`)
- [ ] No duplicate files remain in apps
- [ ] All imports use package names instead of relative paths
- [ ] Apps run correctly in dev mode
- [ ] Apps build successfully
- [ ] Tests pass (if applicable)

## Rollback Plan

If issues arise during migration:

1. **Revert imports:** Change package imports back to local imports
2. **Restore files:** Copy files from git history if deleted
3. **Remove dependencies:** `pnpm remove @zaplit/<package>`

## Troubleshooting

### "Cannot find module '@zaplit/utils'"
- Ensure the package is built: `pnpm --filter @zaplit/utils build`
- Check pnpm-workspace.yaml includes the packages directory
- Run `pnpm install` to link workspace packages

### Type errors after migration
- Ensure peer dependencies match between packages and apps
- Check TypeScript version compatibility
- Verify tsconfig.json paths configuration

### CSS/Tailwind issues
- Verify Tailwind content configuration includes the UI package
- Ensure globals.css imports are correct
- Check for CSS specificity conflicts

## Automation Scripts

### Migration Script

Save as `scripts/migrate-to-packages.ts`:

```typescript
#!/usr/bin/env tsx
/**
 * Migration helper script for moving code to shared packages
 */

import { readFile, writeFile, readdir, stat } from 'fs/promises'
import { join, relative } from 'path'

const IMPORT_MAPPINGS: Record<string, string> = {
  '@/lib/utils': '@zaplit/utils',
  '@/lib/constants': '@zaplit/utils',
  '@/hooks/use-mobile': '@zaplit/hooks',
  '@/hooks/use-toast': '@zaplit/hooks',
  '@/components/ui/alert': '@zaplit/ui',
  '@/components/ui/badge': '@zaplit/ui',
  '@/components/ui/button': '@zaplit/ui',
  '@/components/ui/card': '@zaplit/ui',
  '@/components/ui/dialog': '@zaplit/ui',
  '@/components/ui/form': '@zaplit/ui',
  '@/components/ui/input': '@zaplit/ui',
  '@/components/ui/label': '@zaplit/ui',
  '@/components/ui/separator': '@zaplit/ui',
  '@/components/ui/sheet': '@zaplit/ui',
  '@/components/ui/skeleton': '@zaplit/ui',
  '@/components/ui/tabs': '@zaplit/ui',
  '@/components/ui/textarea': '@zaplit/ui',
  '@/components/ui/toast': '@zaplit/ui',
  '@/components/ui/tooltip': '@zaplit/ui',
  '@/lib/api/response': '@zaplit/api',
  '@/lib/schemas/forms': '@zaplit/forms',
  '@/lib/form-submission': '@zaplit/forms',
}

async function migrateFile(filePath: string): Promise<void> {
  let content = await readFile(filePath, 'utf-8')
  let modified = false

  for (const [oldImport, newImport] of Object.entries(IMPORT_MAPPINGS)) {
    const regex = new RegExp(
      `from ['"]${oldImport}['"]`,
      'g'
    )
    if (regex.test(content)) {
      content = content.replace(regex, `from '${newImport}'`)
      modified = true
    }
  }

  if (modified) {
    await writeFile(filePath, content)
    console.log(`✓ Migrated: ${filePath}`)
  }
}

async function main() {
  const apps = ['zaplit-com', 'zaplit-org']
  
  for (const app of apps) {
    const appPath = join(process.cwd(), app)
    
    // Find all TypeScript files
    async function findTsFiles(dir: string): Promise<string[]> {
      const files: string[] = []
      const entries = await readdir(dir, { withFileTypes: true })
      
      for (const entry of entries) {
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory() && entry.name !== 'node_modules') {
          files.push(...await findTsFiles(fullPath))
        } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
          files.push(fullPath)
        }
      }
      
      return files
    }
    
    const files = await findTsFiles(appPath)
    
    for (const file of files) {
      await migrateFile(file)
    }
  }
  
  console.log('\nMigration complete!')
}

main().catch(console.error)
```

Run with:
```bash
npx tsx scripts/migrate-to-packages.ts
```
