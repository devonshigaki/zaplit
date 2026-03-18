"use client"

import { useState } from "react"
import { Workflow, Search, Megaphone, UserPlus, ChevronDown, ChevronUp, Lock, Eye, AlertCircle, FileEdit, Heart, Calendar, Calculator } from "lucide-react"

type Department = "programs" | "development" | "operations"

const departments: { id: Department; name: string; description: string }[] = [
  { id: "programs", name: "Programs", description: "Program delivery, volunteer coordination, and impact measurement" },
  { id: "development", name: "Development", description: "Fundraising, donor relations, and grant management" },
  { id: "operations", name: "Operations", description: "Administration, finance, and communications" },
]

const agents = {
  programs: [
    {
      name: "Coordinator",
      role: "Volunteer Manager",
      icon: UserPlus,
      description: "Manages volunteer recruitment, scheduling, and communications to keep your programs staffed and running smoothly.",
      capabilities: ["Volunteer Onboarding", "Shift Scheduling", "Communication Hub", "Hour Tracking"],
      credentials: ["Background Check", "SafeServe Certified"],
      isolation: ["Cannot access donor financial data", "Read-only volunteer records", "Template communications only"],
      humanTriggers: ["Sensitive volunteer issues", "Program schedule changes", "Safety incidents"],
      salary: "$55,000",
    },
    {
      name: "Impact",
      role: "Outcomes Analyst",
      icon: Search,
      description: "Tracks program outcomes, generates impact reports, and helps demonstrate your effectiveness to funders and stakeholders.",
      capabilities: ["Outcome Tracking", "Report Generation", "Data Visualization", "Funder Updates"],
      credentials: ["Data Certified", "Privacy Compliant"],
      isolation: ["Read-only program data", "Cannot export beneficiary PII", "Aggregated reports only"],
      humanTriggers: ["Funder report deadlines", "Data methodology changes", "Sensitive outcomes"],
      salary: "$65,000",
    },
  ],
  development: [
    {
      name: "Grant",
      role: "Proposal Writer",
      icon: FileEdit,
      description: "Researches funding opportunities, drafts proposals, and manages grant deadlines to keep your pipeline full.",
      capabilities: ["Funder Research", "Proposal Drafting", "Deadline Tracking", "Budget Narratives"],
      credentials: ["CFRE Aligned", "Grant Certified"],
      isolation: ["Draft-only submissions", "Cannot access bank accounts", "Read-only financial summaries"],
      humanTriggers: ["Final proposal submission", "Budget changes", "New funding opportunities"],
      salary: "$70,000",
    },
    {
      name: "Steward",
      role: "Donor Relations",
      icon: Heart,
      description: "Manages donor communications, thank-you sequences, and stewardship campaigns to build lasting relationships.",
      capabilities: ["Donor Research", "Thank-you Automation", "Campaign Management", "Giving History"],
      credentials: ["Donor Privacy", "AFP Compliant"],
      isolation: ["Cannot process transactions", "Draft-only solicitations", "No credit card access"],
      humanTriggers: ["Major gift solicitations", "Donor complaints", "Planned giving inquiries"],
      salary: "$60,000",
    },
    {
      name: "Events",
      role: "Fundraising Support",
      icon: Calendar,
      description: "Coordinates event logistics, manages registrations, and supports fundraising campaigns from planning to follow-up.",
      capabilities: ["Event Planning", "Registration Management", "Vendor Coordination", "Follow-up Automation"],
      credentials: ["Event Certified", "Vendor Vetted"],
      isolation: ["Cannot sign contracts", "Read-only attendee lists", "Max $1,000 vendor approval"],
      humanTriggers: ["Contracts >$1,000", "VIP attendee issues", "Venue changes"],
      salary: "$50,000",
    },
  ],
  operations: [
    {
      name: "Finance",
      role: "Bookkeeping Assistant",
      icon: Calculator,
      description: "Handles expense categorization, donation recording, and financial reconciliation with strict controls on restricted funds.",
      capabilities: ["Expense Categorization", "Donation Entry", "Reconciliation", "Restricted Fund Tracking"],
      credentials: ["Nonprofit Finance", "Fund Accounting"],
      isolation: ["Cannot move unrestricted funds", "Cannot issue refunds", "Read-only bank access"],
      humanTriggers: ["Fund transfers", "Audit preparation", "Restricted fund releases"],
      salary: "$55,000",
    },
    {
      name: "Communications",
      role: "Content & Outreach",
      icon: Megaphone,
      description: "Creates newsletters, social content, and website updates to keep your community informed and engaged.",
      capabilities: ["Newsletter Creation", "Social Media", "Website Updates", "Press Releases"],
      credentials: ["Brand Certified", "AP Style"],
      isolation: ["Draft-only publishing", "Cannot delete website", "Template responses only"],
      humanTriggers: ["Crisis communications", "Website redesign", "Major announcements"],
      salary: "$58,000",
    },
    {
      name: "Assistant",
      role: "Executive Support",
      icon: Workflow,
      description: "Manages calendars, drafts correspondence, and coordinates board communications to free up leadership time.",
      capabilities: ["Calendar Management", "Draft Correspondence", "Board Prep", "Meeting Notes"],
      credentials: ["Board Certified", "Confidentiality Agreement"],
      isolation: ["Cannot approve expenses", "Read-only calendars", "No contract authority"],
      humanTriggers: ["Board resolutions", "Executive travel", "Personnel matters"],
      salary: "$52,000",
    },
  ],
}

export function AgentsSection() {
  const [activeDepartment, setActiveDepartment] = useState<Department>("programs")
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)

  return (
    <section id="agents" className="py-32 border-t border-border">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <div className="max-w-2xl mb-16">
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">Impact Agents</p>
          <h2 className="text-4xl md:text-5xl font-serif italic mb-6 text-balance">
            Digital teammates that multiply your impact
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Specialized agents organized by nonprofit function. Each designed to handle time-consuming tasks while keeping your mission—and your data—secure.
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
