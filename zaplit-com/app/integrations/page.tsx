"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Terminal, Search, ArrowLeft, Webhook, Code2, Zap, Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

// Logo.dev token - should be moved to environment variable for production
// This is a public token but should still be externalized
const LOGO_TOKEN = process.env.NEXT_PUBLIC_LOGO_TOKEN || ''

const categories = [
  { id: "all", name: "All" },
  { id: "crm", name: "CRM & Sales" },
  { id: "communication", name: "Communication" },
  { id: "productivity", name: "Productivity" },
  { id: "marketing", name: "Marketing" },
  { id: "finance", name: "Finance" },
  { id: "support", name: "Support" },
  { id: "developer", name: "Developer Tools" },
  { id: "data", name: "Data & Analytics" },
  { id: "ai", name: "AI & ML" },
  { id: "infrastructure", name: "Infrastructure" },
  { id: "ecommerce", name: "E-commerce" },
  { id: "hr", name: "HR & Recruiting" },
]

const integrations = [
  // CRM & Sales
  { name: "Salesforce", domain: "salesforce.com", category: "crm" },
  { name: "HubSpot", domain: "hubspot.com", category: "crm" },
  { name: "Pipedrive", domain: "pipedrive.com", category: "crm" },
  { name: "Zoho CRM", domain: "zoho.com", category: "crm" },
  { name: "Close", domain: "close.com", category: "crm" },
  { name: "Copper", domain: "copper.com", category: "crm" },
  { name: "Freshsales", domain: "freshworks.com", category: "crm" },
  { name: "Monday Sales", domain: "monday.com", category: "crm" },
  
  // Communication
  { name: "Slack", domain: "slack.com", category: "communication" },
  { name: "Microsoft Teams", domain: "microsoft.com", category: "communication" },
  { name: "Discord", domain: "discord.com", category: "communication" },
  { name: "Telegram", domain: "telegram.org", category: "communication" },
  { name: "WhatsApp", domain: "whatsapp.com", category: "communication" },
  { name: "Twilio", domain: "twilio.com", category: "communication" },
  { name: "SendGrid", domain: "sendgrid.com", category: "communication" },
  { name: "Mailchimp", domain: "mailchimp.com", category: "communication" },
  { name: "Gmail", domain: "gmail.com", category: "communication" },
  { name: "Outlook", domain: "outlook.com", category: "communication" },
  
  // Productivity
  { name: "Notion", domain: "notion.so", category: "productivity" },
  { name: "Airtable", domain: "airtable.com", category: "productivity" },
  { name: "Asana", domain: "asana.com", category: "productivity" },
  { name: "Trello", domain: "trello.com", category: "productivity" },
  { name: "ClickUp", domain: "clickup.com", category: "productivity" },
  { name: "Todoist", domain: "todoist.com", category: "productivity" },
  { name: "Linear", domain: "linear.app", category: "productivity" },
  { name: "Jira", domain: "atlassian.com", category: "productivity" },
  { name: "Basecamp", domain: "basecamp.com", category: "productivity" },
  { name: "Coda", domain: "coda.io", category: "productivity" },
  
  // Marketing
  { name: "Mailchimp", domain: "mailchimp.com", category: "marketing" },
  { name: "ActiveCampaign", domain: "activecampaign.com", category: "marketing" },
  { name: "Klaviyo", domain: "klaviyo.com", category: "marketing" },
  { name: "Brevo", domain: "brevo.com", category: "marketing" },
  { name: "ConvertKit", domain: "convertkit.com", category: "marketing" },
  { name: "Drip", domain: "drip.com", category: "marketing" },
  { name: "Marketo", domain: "marketo.com", category: "marketing" },
  { name: "Intercom", domain: "intercom.com", category: "marketing" },
  
  // Finance
  { name: "Stripe", domain: "stripe.com", category: "finance" },
  { name: "QuickBooks", domain: "quickbooks.com", category: "finance" },
  { name: "Xero", domain: "xero.com", category: "finance" },
  { name: "PayPal", domain: "paypal.com", category: "finance" },
  { name: "Square", domain: "squareup.com", category: "finance" },
  { name: "Brex", domain: "brex.com", category: "finance" },
  { name: "Wise", domain: "wise.com", category: "finance" },
  { name: "Plaid", domain: "plaid.com", category: "finance" },
  
  // Support
  { name: "Zendesk", domain: "zendesk.com", category: "support" },
  { name: "Intercom", domain: "intercom.com", category: "support" },
  { name: "Freshdesk", domain: "freshdesk.com", category: "support" },
  { name: "Help Scout", domain: "helpscout.com", category: "support" },
  { name: "Front", domain: "front.com", category: "support" },
  { name: "Crisp", domain: "crisp.chat", category: "support" },
  { name: "Drift", domain: "drift.com", category: "support" },
  
  // Developer Tools
  { name: "GitHub", domain: "github.com", category: "developer" },
  { name: "GitLab", domain: "gitlab.com", category: "developer" },
  { name: "Bitbucket", domain: "bitbucket.org", category: "developer" },
  { name: "Vercel", domain: "vercel.com", category: "developer" },
  { name: "Netlify", domain: "netlify.com", category: "developer" },
  { name: "Heroku", domain: "heroku.com", category: "developer" },
  { name: "Docker", domain: "docker.com", category: "developer" },
  { name: "Sentry", domain: "sentry.io", category: "developer" },
  { name: "PagerDuty", domain: "pagerduty.com", category: "developer" },
  { name: "Datadog", domain: "datadoghq.com", category: "developer" },
  
  // Data & Analytics
  { name: "Google Analytics", domain: "analytics.google.com", category: "data" },
  { name: "Mixpanel", domain: "mixpanel.com", category: "data" },
  { name: "Amplitude", domain: "amplitude.com", category: "data" },
  { name: "Segment", domain: "segment.com", category: "data" },
  { name: "Snowflake", domain: "snowflake.com", category: "data" },
  { name: "BigQuery", domain: "cloud.google.com", category: "data" },
  { name: "Tableau", domain: "tableau.com", category: "data" },
  { name: "Looker", domain: "looker.com", category: "data" },
  { name: "Metabase", domain: "metabase.com", category: "data" },
  
  // AI & ML
  { name: "OpenAI", domain: "openai.com", category: "ai" },
  { name: "Anthropic", domain: "anthropic.com", category: "ai" },
  { name: "Google AI", domain: "ai.google", category: "ai" },
  { name: "Hugging Face", domain: "huggingface.co", category: "ai" },
  { name: "Cohere", domain: "cohere.ai", category: "ai" },
  { name: "Replicate", domain: "replicate.com", category: "ai" },
  { name: "ElevenLabs", domain: "elevenlabs.io", category: "ai" },
  { name: "Pinecone", domain: "pinecone.io", category: "ai" },
  
  // Infrastructure
  { name: "AWS", domain: "aws.amazon.com", category: "infrastructure" },
  { name: "Google Cloud", domain: "cloud.google.com", category: "infrastructure" },
  { name: "Azure", domain: "azure.microsoft.com", category: "infrastructure" },
  { name: "DigitalOcean", domain: "digitalocean.com", category: "infrastructure" },
  { name: "Cloudflare", domain: "cloudflare.com", category: "infrastructure" },
  { name: "Supabase", domain: "supabase.com", category: "infrastructure" },
  { name: "Firebase", domain: "firebase.google.com", category: "infrastructure" },
  { name: "MongoDB", domain: "mongodb.com", category: "infrastructure" },
  { name: "Redis", domain: "redis.com", category: "infrastructure" },
  { name: "PostgreSQL", domain: "postgresql.org", category: "infrastructure" },
  
  // E-commerce
  { name: "Shopify", domain: "shopify.com", category: "ecommerce" },
  { name: "WooCommerce", domain: "woocommerce.com", category: "ecommerce" },
  { name: "BigCommerce", domain: "bigcommerce.com", category: "ecommerce" },
  { name: "Magento", domain: "magento.com", category: "ecommerce" },
  { name: "Squarespace", domain: "squarespace.com", category: "ecommerce" },
  { name: "Wix", domain: "wix.com", category: "ecommerce" },
  { name: "Gumroad", domain: "gumroad.com", category: "ecommerce" },
  { name: "Lemonsqueezy", domain: "lemonsqueezy.com", category: "ecommerce" },
  
  // HR & Recruiting
  { name: "Workday", domain: "workday.com", category: "hr" },
  { name: "BambooHR", domain: "bamboohr.com", category: "hr" },
  { name: "Greenhouse", domain: "greenhouse.io", category: "hr" },
  { name: "Lever", domain: "lever.co", category: "hr" },
  { name: "Gusto", domain: "gusto.com", category: "hr" },
  { name: "Rippling", domain: "rippling.com", category: "hr" },
  { name: "Deel", domain: "deel.com", category: "hr" },
  { name: "Remote", domain: "remote.com", category: "hr" },
]

function IntegrationCard({ name, domain }: { name: string; domain: string }) {
  const logoSrc = `https://img.logo.dev/${domain}?token=${LOGO_TOKEN}`

  return (
    <div className="bg-card border border-border rounded-xl p-4 hover:border-muted-foreground transition-colors flex flex-col items-center gap-3">
      <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center overflow-hidden">
        <Image
          src={logoSrc}
          alt={`${name} logo`}
          width={48}
          height={48}
          className="w-full h-full object-contain p-1.5 rounded-lg"
        />
      </div>
      <p className="text-sm font-medium text-center">{name}</p>
    </div>
  )
}

export default function IntegrationsPage() {
  const [search, setSearch] = useState("")
  const [activeCategory, setActiveCategory] = useState("all")

  const filteredIntegrations = integrations.filter((integration) => {
    const matchesSearch = integration.name.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = activeCategory === "all" || integration.category === activeCategory
    return matchesSearch && matchesCategory
  })

  // Remove duplicates based on name
  const uniqueIntegrations = filteredIntegrations.filter(
    (integration, index, self) =>
      index === self.findIndex((t) => t.name === integration.name)
  )

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-foreground text-background rounded flex items-center justify-center">
              <Terminal className="w-4 h-4" />
            </div>
            <span className="font-mono text-lg font-medium tracking-tight">zaplit</span>
          </Link>
          <Button variant="outline" size="sm" asChild>
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Link>
          </Button>
        </div>
      </nav>

      <main className="pt-32 pb-24">
        <div className="max-w-7xl mx-auto px-6">
          {/* Header */}
          <div className="max-w-3xl mb-16">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">Integrations</p>
            <h1 className="text-4xl md:text-5xl font-serif italic mb-6 text-balance">
              Connect to everything
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed mb-8">
              400+ native integrations to connect your agents with the tools you already use. 
              Custom API and webhook flows available for anything else.
            </p>

            {/* Search */}
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search integrations..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Custom Integration Banner */}
          <div className="bg-card border border-border rounded-xl p-6 mb-12">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-secondary border border-border flex items-center justify-center shrink-0">
                  <Webhook className="w-6 h-6 text-foreground" />
                </div>
                <div>
                  <h3 className="text-lg font-medium mb-1">Need a custom integration?</h3>
                  <p className="text-sm text-muted-foreground">
                    Connect any API or service via custom webhooks and HTTP requests. 
                    Our team configures custom flows during deployment.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-sm">
                  <Code2 className="w-4 h-4" />
                  <span>REST APIs</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-sm">
                  <Zap className="w-4 h-4" />
                  <span>Webhooks</span>
                </div>
              </div>
            </div>
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2 -mx-6 px-6 scrollbar-hide">
            <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                  activeCategory === category.id
                    ? "bg-foreground text-background"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>

          {/* Results count */}
          <p className="text-sm text-muted-foreground mb-6">
            {uniqueIntegrations.length} integration{uniqueIntegrations.length !== 1 ? "s" : ""} found
          </p>

          {/* Integrations Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-16">
            {uniqueIntegrations.map((integration) => (
              <IntegrationCard key={`${integration.name}-${integration.category}`} {...integration} />
            ))}
          </div>

          {/* Bottom CTA */}
          <div className="text-center border-t border-border pt-16">
            <h2 className="text-2xl md:text-3xl font-serif italic mb-4">
              Don't see your integration?
            </h2>
            <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
              We configure custom integrations during deployment. Any service with an API can be connected.
            </p>
            <Button asChild>
              <Link href="/#book-demo">Book a Consultation</Link>
            </Button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Zaplit. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
