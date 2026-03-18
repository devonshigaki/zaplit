"use client"

import { Database, Mail, Shield, AlertTriangle, Power, CheckCircle2, XCircle, Clock } from "lucide-react"

const securityFeatures = [
  {
    icon: Database,
    title: "Database Protection",
    description: "Agents operate in sandboxed containers with strict RBAC. Read-only access prevents accidental deletions or modifications.",
    examples: [
      { text: "Cannot execute DROP commands", blocked: true },
      { text: "Cannot delete production records", blocked: true },
      { text: "Query market analysis data", blocked: false },
    ],
  },
  {
    icon: Mail,
    title: "Communication Guards",
    description: "Draft-only mode for emails and messages. Bulk sends require explicit human approval. All outbound communication is logged and auditable.",
    examples: [
      { text: "Send to >100 recipients", blocked: true },
      { text: "Access external addresses outside CRM", blocked: true },
      { text: "Draft campaign email", blocked: false },
    ],
  },
  {
    icon: Shield,
    title: "Instruction Firewall",
    description: "Agents cannot instruct employees to perform tasks outside predefined workflows. Prevents social engineering.",
    examples: [
      { text: "Request employee credentials", blocked: true },
      { text: "Bypass approval workflows", blocked: true },
      { text: "Escalate within defined rules", blocked: false },
    ],
  },
]

const approvalQueue = [
  {
    id: "APR-001",
    agent: "Marketing",
    action: "Launch email campaign",
    value: "$2,500 ad spend",
    status: "pending",
  },
  {
    id: "APR-002",
    agent: "Billing",
    action: "Process refund",
    value: "$847.00",
    status: "pending",
  },
  {
    id: "APR-003",
    agent: "Lead",
    action: "Export lead list",
    value: "1,240 contacts",
    status: "approved",
  },
]

export function SecuritySection() {
  return (
    <section id="security" className="py-32 border-t border-border">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <div className="max-w-2xl mb-20">
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">Agent Isolation</p>
          <h2 className="text-4xl md:text-5xl font-serif italic mb-6 text-balance">
            Security by design, not afterthought
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Every agent runs in an isolated container with strict role-based access control. They cannot exceed their boundaries—even if they try.
          </p>
        </div>

        {/* Security Features Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-20">
          {securityFeatures.map((feature) => (
            <div
              key={feature.title}
              className="bg-card border border-border rounded-xl p-6 space-y-6"
            >
              <div className="w-12 h-12 rounded-lg bg-secondary border border-border flex items-center justify-center">
                <feature.icon className="w-6 h-6 text-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
              <div className="space-y-2">
                {feature.examples.map((example, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs font-mono">
                    {example.blocked ? (
                      <XCircle className="w-4 h-4 text-destructive shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                    )}
                    <span className={example.blocked ? "text-muted-foreground" : "text-foreground"}>
                      {example.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Human in the Loop */}
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <div>
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">Human in the Loop</p>
              <h3 className="text-3xl md:text-4xl font-serif italic mb-6 text-balance">
                You approve everything that matters
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Financial transactions above $500, bulk communications, and anomaly-detected actions all require human approval. Emergency kill switches are always within reach.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 rounded-lg bg-secondary/50 border border-border">
                <AlertTriangle className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
                <p className="text-xs font-mono text-muted-foreground">Anomaly Detection</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-secondary/50 border border-border">
                <Clock className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
                <p className="text-xs font-mono text-muted-foreground">$500 Threshold</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-secondary/50 border border-border">
                <Power className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
                <p className="text-xs font-mono text-muted-foreground">Kill Switch</p>
              </div>
            </div>
          </div>

          {/* Approval Queue UI */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h4 className="text-sm font-mono">Approval Queue</h4>
              <span className="text-xs font-mono text-muted-foreground">3 pending</span>
            </div>
            <div className="divide-y divide-border">
              {approvalQueue.map((item) => (
                <div key={item.id} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-muted-foreground">{item.id}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground">{item.agent}</span>
                    </div>
                    <p className="text-sm font-medium truncate">{item.action}</p>
                    <p className="text-xs text-muted-foreground">{item.value}</p>
                  </div>
                  {item.status === "pending" ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <button className="px-3 py-1.5 rounded-md bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 transition-colors">
                        Deny
                      </button>
                      <button className="px-3 py-1.5 rounded-md bg-success/10 text-success text-xs font-medium hover:bg-success/20 transition-colors">
                        Approve
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded bg-success/10 text-success">Approved</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
