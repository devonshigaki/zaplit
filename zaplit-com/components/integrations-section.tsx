'use client'

import Image from 'next/image'

// Logo.dev token - should be moved to environment variable for production
// This is a public token but should still be externalized
const LOGO_TOKEN = process.env.NEXT_PUBLIC_LOGO_TOKEN || ''

const integrations = [
  { name: 'Salesforce', category: 'CRM', domain: 'salesforce.com' },
  { name: 'HubSpot', category: 'CRM', domain: 'hubspot.com' },
  { name: 'Slack', category: 'Communication', domain: 'slack.com' },
  { name: 'Microsoft Teams', category: 'Communication', domain: 'microsoft.com' },
  { name: 'Stripe', category: 'Finance', domain: 'stripe.com' },
  { name: 'QuickBooks', category: 'Finance', domain: 'quickbooks.com' },
  { name: 'Notion', category: 'Productivity', domain: 'notion.so' },
  { name: 'Airtable', category: 'Productivity', domain: 'airtable.com' },
  { name: 'Zendesk', category: 'Support', domain: 'zendesk.com' },
  { name: 'Intercom', category: 'Support', domain: 'intercom.com' },
  { name: 'AWS', category: 'Infrastructure', domain: 'aws.amazon.com' },
  { name: 'Google Cloud', category: 'Infrastructure', domain: 'cloud.google.com' },
]

function IntegrationCard({
  name,
  category,
  domain,
}: {
  name: string
  category: string
  domain: string
}) {
  const logoSrc = `https://img.logo.dev/${domain}?token=${LOGO_TOKEN}`

  return (
    <div className="aspect-square bg-card border border-border rounded-xl flex flex-col items-center justify-center p-4 hover:border-muted-foreground transition-colors">
      <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center mb-3 overflow-hidden">
        <Image
          src={logoSrc}
          alt={`${name} logo`}
          width={48}
          height={48}
          className="w-full h-full object-contain p-1 rounded-2xl"
          loading="lazy"
        />
      </div>
      <p className="text-xs font-medium text-center leading-tight">{name}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{category}</p>
    </div>
  )
}

export function IntegrationsSection() {
  return (
    <section className="py-32 border-t border-border">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">
            Integrations
          </p>
          <h2 className="text-4xl md:text-5xl font-serif italic mb-6 text-balance">
            Connect to everything
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            400+ native integrations. Custom API and webhook flows for anything else. You own the connections—no vendor lock-in.
          </p>
        </div>

        {/* Integrations Grid */}
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4 mb-16">
          {integrations.map((integration) => (
            <IntegrationCard key={integration.name} {...integration} />
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-6 max-w-3xl mx-auto mb-12">
          <div className="text-center">
            <p className="text-4xl font-mono font-medium">400+</p>
            <p className="text-sm text-muted-foreground">Native Apps</p>
          </div>
          <div className="text-center">
            <p className="text-4xl font-mono font-medium">100%</p>
            <p className="text-sm text-muted-foreground">Open Source</p>
          </div>
          <div className="text-center">
            <p className="text-4xl font-mono font-medium">0</p>
            <p className="text-sm text-muted-foreground">Vendor Lock-in</p>
          </div>
        </div>

        {/* View All Link */}
        <div className="text-center">
          <a 
            href="/integrations" 
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            View all 400+ integrations
            <span aria-hidden="true">→</span>
          </a>
        </div>
      </div>
    </section>
  )
}
