# Development

> **Development guidelines and best practices**

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Make changes with tests
4. Run quality checks (`pnpm ci`)
5. Submit pull request

## Code Standards

### TypeScript (Strict)

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true
  }
}
```

### Component Patterns

**Server Component (Default):**
```tsx
// No 'use client'
export default async function Page() {
  const data = await fetch('/api/data');
  return <div>{data}</div>;
}
```

**Client Component:**
```tsx
'use client';
import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

**Form Component:**
```tsx
'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email()
});

export function MyForm() {
  const { register, handleSubmit } = useForm({
    resolver: zodResolver(schema)
  });
  return <form onSubmit={handleSubmit(onSubmit)}>...</form>;
}
```

## Testing

### Unit Tests (Vitest)

```bash
pnpm test
pnpm test:watch
```

### E2E Tests (Playwright)

```bash
pnpm test:e2e
pnpm test:e2e --ui
```

## File Naming

| Type | Pattern |
|------|---------|
| Components | PascalCase (`Button.tsx`) |
| Hooks | camelCase with `use` (`useForm.ts`) |
| Utils | camelCase (`formatDate.ts`) |
| Types | PascalCase (`FormData.ts`) |

## Do's and Don'ts

✅ **Do:**
- Use Server Components by default
- Use React Hook Form + Zod for forms
- Colocate tests (`*.test.tsx`)
- Use `next/image` for images
- Use `next/link` for navigation

❌ **Don't:**
- Use `any` types
- Fetch in `useEffect` (use Server Components)
- Use inline styles
- Commit `.env.local`

---

**Related**: [Testing](./testing.md), [Operations](../ops/)
