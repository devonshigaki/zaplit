# zaplit-com - Agent Context

Business market website for Zaplit.

## Quick Reference

```bash
# Development
pnpm dev              # Next.js dev server on :3000

# Testing
pnpm test             # Vitest watch mode
pnpm test:run         # Single test run
pnpm test:coverage    # Coverage report

# Building
pnpm build            # Production build
pnpm analyze          # Bundle analysis
```

## App-Specific Context

### Branding
- **Name:** Zaplit (business)
- **Tagline:** "Hire a Digital Team"
- **Focus:** Enterprise, operations, productivity

### Key Differences from zaplit-org
This app differs from zaplit-org in these files only:
- `app/layout.tsx` - Title and metadata
- `app/page.tsx` - Main landing page content
- `components/hero.tsx` - Hero section content
- `components/agents-section.tsx` - Department focus
- `components/navigation.tsx` - Logo and nav
- `components/footer.tsx` - Links and columns
- `components/plans-section.tsx` - Pricing
- `components/calculator-section.tsx` - ROI calc
- `components/faq-section.tsx` - Business FAQs
- `components/book-demo-section.tsx` - CTA
- `components/integrations-section.tsx` - Tools
- `components/security-section.tsx` - Security
- `components/solutions-section.tsx` - Solutions
- `components/ui/background-boxes.tsx` - Animation
- `middleware.ts` - CORS origins
- `app/contact/page.tsx` - Contact page

All other files should be identical to zaplit-org.

### Content Strategy
- Industry solutions: Automotive, Insurance, Real Estate, Healthcare, Manufacturing
- Department focus: Operations, Product, Customer Service, Sales
- Pricing: Starter ($2,999), Professional ($4,999), Enterprise (custom)

## Component Patterns

### Section Components
Located in `components/`:
- Server components by default
- Receive data via props
- Use composition over prop drilling
- Example: `<Hero title="..." description="..." />`

### UI Components
Located in `components/ui/`:
- Built on Radix UI primitives
- Styled with Tailwind
- Forward refs
- Support all HTML attributes

### Form Handling
- Use `useFormSubmission` hook
- Zod schema validation
- Loading and error states
- Success feedback

## API Routes

### POST /api/submit-form
Main form submission endpoint:
- Rate limited: 5 req/min per IP
- Validates with Zod schemas
- Sanitizes input
- Sends to n8n webhook
- Audit logs with hashed PII

### GET /api/health
Health check for monitoring:
- Returns `{ status: "healthy", timestamp }`
- Used by Cloud Run health checks

### GET /api/health/ready
Readiness probe:
- Returns `{ ready: true, checks: {...} }`
- Used by Kubernetes

## Form Types

1. **contact** - General contact form
2. **demo** - Book a demo (consultation)
3. **newsletter** - Email subscription

## Environment Variables

Required:
```bash
N8N_WEBHOOK_URL_CONTACT=
N8N_WEBHOOK_URL_DEMO=
N8N_WEBHOOK_URL_NEWSLETTER=
N8N_WEBHOOK_SECRET=
IP_HASH_SALT=
NEXT_PUBLIC_LOGO_TOKEN=
```

## Testing

Test files:
- `lib/form-submission.test.ts`
- `lib/schemas/forms.test.ts`

Mock Next.js APIs:
- `next/navigation`
- `next/headers`

## Build Configuration

Key next.config.mjs settings:
- `output: 'standalone'` - For Docker
- Image optimization enabled
- CSP headers configured
- Bundle analyzer integration

## Common Tasks

### Adding a New Section
1. Create component in `components/`
2. Add to `app/page.tsx`
3. Update navigation if needed
4. Add tests if complex logic

### Modifying Forms
1. Update schema in `lib/schemas/forms.ts`
2. Update component state types
3. Test validation
4. Sync changes to zaplit-org

### Adding API Endpoints
1. Create `app/api/{route}/route.ts`
2. Use response helpers from `lib/api/response`
3. Add rate limiting
4. Add audit logging

## Sync with zaplit-org

When modifying shared files, sync to zaplit-org:
- `components/ui/*`
- `hooks/*`
- `lib/*` (except env.ts if site-specific)
- `app/api/*`
- `app/globals.css`
- `app/about/page.tsx`
- `app/blog/*`
- `app/careers/page.tsx`
- `app/integrations/page.tsx`
- `app/privacy/page.tsx`
- `app/terms/page.tsx`

## Security Checklist

- [ ] No secrets in code
- [ ] Input validation with Zod
- [ ] Rate limiting on mutations
- [ ] PII hashed in logs
- [ ] XSS sanitization
- [ ] CSP headers active

## Troubleshooting

### Build fails
Check for:
- Type errors: `pnpm typecheck`
- Import errors (ESM vs CJS)
- Missing environment variables

### Form submissions not working
- Check n8n webhook URL
- Verify webhook secret
- Check rate limiting logs
- Test with curl: `curl -X POST http://localhost:3000/api/submit-form ...`

### Styles not applying
- Check Tailwind class names
- Verify `cn()` helper usage
- Check for CSS specificity issues
