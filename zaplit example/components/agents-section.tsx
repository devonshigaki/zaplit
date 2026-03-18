"use client"

import { useState } from "react"
import { Workflow, Search, Shield, Megaphone, UserPlus, Receipt, HeadphonesIcon, ChevronDown, ChevronUp, Lock, Eye, AlertCircle } from "lucide-react"

type Department = "operations" | "product" | "service"

const departments: { id: Department; name: string; description: string }[] = [
  { id: "operations", name: "Operations", description: "Central coordination and workflow management" },
  { id: "product", name: "Product", description: "Research, security, and marketing intelligence" },
  { id: "service", name: "Service", description: "Lead generation, billing, and customer support" },
]

const agents = {
  operations: [
    {
      name: "Secretary",
      role: "Orchestrator",
      icon: Workflow,
      description: "Central workflow coordinator that manages cross-agent communication, task delegation, and priority management.",
      capabilities: ["Task Routing", "Priority Management", "Cross-Agent Sync", "Workflow Automation"],
      credentials: ["RBAC Certified", "Audit Logging"],
      isolation: ["Cannot access financial systems directly", "Read-only agent status", "No external communications"],
      humanTriggers: ["Workflow changes", "Priority overrides", "New agent onboarding"],
      salary: "$95,000",
    },
  ],
  product: [
    {
      name: "Research",
      role: "Market Intelligence",
      icon: Search,
      description: "Synthesizes market intelligence, competitive analysis, and data insights for strategic decision-making.",
      capabilities: ["Market Analysis", "Competitor Tracking", "Trend Detection", "Data Synthesis"],
      credentials: ["Data Certified", "NDA Compliant"],
      isolation: ["Read-only database access", "Cannot export PII", "No direct customer contact"],
      humanTriggers: ["Report publishing", "Data source changes", "Competitive alerts"],
      salary: "$85,000",
    },
    {
      name: "Security",
      role: "Threat Detection",
      icon: Shield,
      description: "Monitors for threats, ensures compliance, and maintains comprehensive audit trails.",
      capabilities: ["Threat Detection", "Compliance Monitoring", "Audit Trails", "Vulnerability Scanning"],
      credentials: ["SOC2 Certified", "GDPR Expert"],
      isolation: ["Read-only production logs", "Can recommend blocks only", "Cannot execute security actions"],
      humanTriggers: ["Security incidents", "Policy changes", "Compliance reports"],
      salary: "$110,000",
    },
    {
      name: "Marketing",
      role: "Content & Campaigns",
      icon: Megaphone,
      description: "Creates content, manages campaigns, and optimizes SEO with strict communication limits.",
      capabilities: ["Content Creation", "Campaign Management", "SEO Optimization", "Analytics"],
      credentials: ["Brand Certified", "A/B Testing"],
      isolation: ["Draft-only emails", "Cannot send to >100 recipients", "Max $500 ad spend without approval"],
      humanTriggers: ["Campaign launch", "Budget >$500", "Brand guideline changes"],
      salary: "$85,000",
    },
  ],
  service: [
    {
      name: "Lead",
      role: "Sales Development",
      icon: UserPlus,
      description: "Handles sales development, outreach sequences, and CRM management with communication guardrails.",
      capabilities: ["Lead Scoring", "Outreach Automation", "CRM Management", "Pipeline Analytics"],
      credentials: ["CRM Certified", "GDPR Compliant"],
      isolation: ["Cannot delete CRM records", "Max 50 emails/day", "Template-only communications"],
      humanTriggers: ["High-value leads", "Contract negotiations", "CRM data changes"],
      salary: "$75,000",
    },
    {
      name: "Billing",
      role: "Financial Operations",
      icon: Receipt,
      description: "Manages invoicing, payment processing, and financial reconciliation with strict approval thresholds.",
      capabilities: ["Invoice Generation", "Payment Processing", "Reconciliation", "Financial Reporting"],
      credentials: ["PCI Compliant", "SOX Ready"],
      isolation: ["Cannot issue refunds >$500", "Cannot delete invoices", "Read-only historical data"],
      humanTriggers: ["Refunds >$500", "Payment disputes", "Pricing changes"],
      salary: "$70,000",
    },
    {
      name: "Support",
      role: "Customer Success",
      icon: HeadphonesIcon,
      description: "Resolves customer tickets and provides support using template responses and escalation workflows.",
      capabilities: ["Ticket Resolution", "FAQ Responses", "Escalation Routing", "Satisfaction Tracking"],
      credentials: ["Support Certified", "Multi-lingual"],
      isolation: ["Cannot delete tickets", "Cannot access billing details", "Template responses only"],
      humanTriggers: ["Escalations", "Refund requests", "VIP customers"],
      salary: "$50,000",
    },
  ],
}

export function AgentsSection() {
  const [activeDepartment, setActiveDepartment] = useState<Department>("operations")
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)

  return (
    <section id="agents" className="py-32 border-t border-border">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <div className="max-w-2xl mb-16">
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">The Seven</p>
          <h2 className="text-4xl md:text-5xl font-serif italic mb-6 text-balance">
            Digital employees that build reputation
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Seven specialized agents organized into three departments. Each with specific capabilities, strict isolation scopes, and credential-based trust.
          </p>
        </div>

        {/* Department Tabs */}
        <div className="flex flex-wrap gap-3 mb-12">
          {departments.map((dept) => (
            <button
              key={dept.id}
              onClick={() => setActiveDepartment(dept.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeDepartment === dept.id
                  ? "bg-foreground text-background"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {dept.name}
            </button>
          ))}
        </div>

        {/* Department Description */}
        <p className="text-sm text-muted-foreground mb-8">
          {departments.find((d) => d.id === activeDepartment)?.description}
        </p>

        {/* Agent Cards */}
        <div className="grid gap-4">
          {agents[activeDepartment].map((agent) => (
            <div
              key={agent.name}
              className="bg-card border border-border rounded-xl overflow-hidden"
            >
              {/* Agent Header */}
              <button
                onClick={() => setExpandedAgent(expandedAgent === agent.name ? null : agent.name)}
                className="w-full px-6 py-5 flex items-center justify-between hover:bg-secondary/30 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-secondary border border-border flex items-center justify-center">
                    <agent.icon className="w-6 h-6 text-foreground" />
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-medium">{agent.name}</h3>
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-secondary text-muted-foreground">
                        {agent.role}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground hidden sm:block">{agent.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="hidden md:flex items-center gap-2">
                    {agent.credentials.map((cred) => (
                      <span key={cred} className="text-xs font-mono px-2 py-1 rounded border border-border text-muted-foreground">
                        {cred}
                      </span>
                    ))}
                  </div>
                  <div className="text-right hidden sm:block">
                    <p className="text-xs text-muted-foreground">Comparable salary</p>
                    <p className="font-mono text-sm">{agent.salary}</p>
                  </div>
                  {expandedAgent === agent.name ? (
                    <ChevronUp className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
              </button>

              {/* Expanded Content */}
              {expandedAgent === agent.name && (
                <div className="px-6 pb-6 border-t border-border pt-6">
                  <p className="text-sm text-muted-foreground mb-6 sm:hidden">{agent.description}</p>
                  
                  <div className="grid md:grid-cols-3 gap-6">
                    {/* Capabilities */}
                    <div>
                      <h4 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-3">Capabilities</h4>
                      <div className="flex flex-wrap gap-2">
                        {agent.capabilities.map((cap) => (
                          <span key={cap} className="text-xs px-2 py-1 rounded bg-secondary text-foreground">
                            {cap}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Isolation Scope */}
                    <div>
                      <h4 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Lock className="w-3 h-3" />
                        Isolation Scope
                      </h4>
                      <div className="space-y-2">
                        {agent.isolation.map((rule) => (
                          <div key={rule} className="flex items-start gap-2 text-xs">
                            <Eye className="w-3 h-3 mt-0.5 text-muted-foreground shrink-0" />
                            <span className="text-muted-foreground">{rule}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Human Triggers */}
                    <div>
                      <h4 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                        <AlertCircle className="w-3 h-3" />
                        Requires Approval
                      </h4>
                      <div className="space-y-2">
                        {agent.humanTriggers.map((trigger) => (
                          <div key={trigger} className="flex items-start gap-2 text-xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
                            <span className="text-muted-foreground">{trigger}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Mobile credentials */}
                  <div className="md:hidden flex flex-wrap gap-2 mt-6 pt-6 border-t border-border">
                    {agent.credentials.map((cred) => (
                      <span key={cred} className="text-xs font-mono px-2 py-1 rounded border border-border text-muted-foreground">
                        {cred}
                      </span>
                    ))}
                    <span className="font-mono text-sm ml-auto">{agent.salary}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
