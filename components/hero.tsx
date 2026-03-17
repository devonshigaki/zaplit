"use client"

import { Button } from "@/components/ui/button"
import { ArrowRight, Database, Mail, UserCheck, Lock, Shield, FileCheck } from "lucide-react"

const isolationContainers = [
  {
    icon: Database,
    label: "Database",
    status: "Read-Only",
    color: "text-muted-foreground",
  },
  {
    icon: Mail,
    label: "Communication",
    status: "Draft Only",
    color: "text-muted-foreground",
  },
  {
    icon: UserCheck,
    label: "Human Approval",
    status: "Required",
    color: "text-muted-foreground",
  },
]

const logEntries = [
  { time: "12:04:32", agent: "Marketing", action: "Send campaign to 500 recipients", status: "blocked" },
  { time: "12:04:18", agent: "Research", action: "Query market data", status: "approved" },
  { time: "12:03:55", agent: "Billing", action: "Process invoice #4521", status: "approved" },
  { time: "12:03:41", agent: "Security", action: "Export user PII data", status: "blocked" },
  { time: "12:03:22", agent: "Support", action: "Update ticket #892", status: "approved" },
]

export function Hero() {
  return (
    <section className="relative min-h-svh flex items-center justify-center pt-24 pb-16 md:pt-32 md:pb-24 overflow-hidden border-b border-border">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
          backgroundSize: '48px 48px',
          opacity: 0.15,
        }} />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 w-full">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Left Content */}
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-secondary/50 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-muted-foreground">Boutique agent builds</span>
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-serif italic leading-[1.1] tracking-tight text-balance">
              Hire a Digital Team, Not Software
            </h1>

            <p className="text-lg text-muted-foreground max-w-lg leading-relaxed">
              Pre-built AI agent teams with white-glove deployment. They can't delete your database or send unauthorized emails. <span className="text-foreground font-medium">Ever.</span>
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" className="group" asChild>
                <a href="#plans">
                  Configure Your Team
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </a>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href="#calculator">Calculate Savings</a>
              </Button>
            </div>

            {/* Trust Signals */}
            <div className="flex flex-wrap items-center gap-4 sm:gap-6 pt-4 text-xs sm:text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                <span>SOC2 Ready</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                <span>GDPR Compliant</span>
              </div>
              <div className="flex items-center gap-2">
                <FileCheck className="w-4 h-4" />
                <span>Open Source</span>
              </div>
            </div>
          </div>

          {/* Right Content - Isolation Visualization */}
          <div className="relative">
            {/* Main Container */}
            <div className="relative bg-card border border-border rounded-xl p-6 space-y-6">
              {/* Isolation Containers */}
              <div className="grid grid-cols-3 gap-3">
                {isolationContainers.map((container) => (
                  <div
                    key={container.label}
                    className="flex flex-col items-center gap-3 p-4 rounded-lg bg-secondary/50 border border-border"
                  >
                    <div className="w-10 h-10 rounded-lg bg-background border border-border flex items-center justify-center">
                      <container.icon className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-mono text-muted-foreground">{container.label}</p>
                      <p className="text-xs font-mono font-medium text-foreground">{container.status}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Isolation Log */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Isolation Log</h3>
                  <span className="text-xs font-mono text-muted-foreground">Live</span>
                </div>
                <div className="bg-background rounded-lg border border-border overflow-hidden">
                  <div className="divide-y divide-border">
                    {logEntries.map((entry, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2 text-xs font-mono">
                        <span className="text-muted-foreground shrink-0">{entry.time}</span>
                        <span className="text-muted-foreground shrink-0 w-20">{entry.agent}</span>
                        <span className="text-foreground truncate flex-1">{entry.action}</span>
                        <span
                          className={`shrink-0 px-2 py-0.5 rounded text-xs ${
                            entry.status === "approved"
                              ? "bg-success/10 text-success"
                              : "bg-destructive/10 text-destructive"
                          }`}
                        >
                          {entry.status.toUpperCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Decorative Elements */}
            <div className="absolute -top-4 -right-4 w-24 h-24 border border-border rounded-xl opacity-20" />
            <div className="absolute -bottom-4 -left-4 w-16 h-16 border border-border rounded-lg opacity-20" />
          </div>
        </div>
      </div>
    </section>
  )
}
