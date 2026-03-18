"use client"

import { Button } from "@/components/ui/button"
import { ArrowRight, Database, Mail, UserCheck, Lock, Shield, FileCheck } from "lucide-react"

const isolationContainers = [
  {
    icon: Database,
    label: "Database",
    status: "Read-Only",
  },
  {
    icon: Mail,
    label: "Communication",
    status: "Draft Only",
  },
  {
    icon: UserCheck,
    label: "Human Approval",
    status: "Required",
  },
]

const logEntries = [
  { time: "12:04:32", agent: "Development", action: "Draft donor thank-you emails", status: "approved" },
  { time: "12:04:18", agent: "Programs", action: "Generate impact report", status: "approved" },
  { time: "12:03:55", agent: "Grants", action: "Research matching funders", status: "approved" },
  { time: "12:03:41", agent: "Finance", action: "Access unrestricted funds", status: "blocked" },
  { time: "12:03:22", agent: "Volunteer", action: "Schedule orientation calls", status: "approved" },
]

export function Hero() {
  return (
    <section className="relative pt-20 pb-12 md:pt-24 md:pb-32 lg:min-h-svh lg:flex lg:flex-col lg:justify-center border-b border-border">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
          backgroundSize: '48px 48px',
          opacity: 0.15,
        }} />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 w-full">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-12 lg:items-center">
          {/* Left Content */}
          <div className="space-y-6 md:space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-secondary/50 text-xs font-mono">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
              </span>
              <span className="text-muted-foreground">Purpose-built for nonprofits</span>
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-serif italic leading-[1.1] tracking-tight text-balance">
              Amplify Your Impact, Not Your Overhead
            </h1>

            <p className="text-lg text-muted-foreground max-w-lg leading-relaxed">
              AI agents that handle donor communications, grant applications, and program coordination—so you can focus on your mission. <span className="text-foreground font-medium">Secure, affordable, and designed for good.</span>
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" className="group" asChild>
                <a href="#plans">
                  Explore Nonprofit Solutions
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </a>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href="#calculator">See Impact Calculator</a>
              </Button>
            </div>

            {/* Trust Signals */}
            <div className="flex flex-wrap items-center gap-4 sm:gap-6 pt-4 text-xs sm:text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                <span>Nonprofit Trusted</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                <span>Data Secure</span>
              </div>
              <div className="flex items-center gap-2">
                <FileCheck className="w-4 h-4" />
                <span>Budget Friendly</span>
              </div>
            </div>
          </div>

          {/* Right Content - Desktop Visualization Only */}
          <div className="hidden lg:block relative">
            <div className="relative bg-card border border-border rounded-xl p-6 space-y-6">
              {/* Desktop Cards - Grid */}
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

              {/* Desktop Log - Full Table */}
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

            {/* Desktop Decorative Elements */}
            <div className="absolute -top-4 -right-4 w-24 h-24 border border-border rounded-xl opacity-20" />
            <div className="absolute -bottom-4 -left-4 w-16 h-16 border border-border rounded-lg opacity-20" />
          </div>
        </div>

        {/* Mobile Visualization - Below the grid on mobile only */}
        <div className="mt-8 lg:hidden">
          <div className="bg-card border border-border rounded-xl p-4 space-y-4">
            {/* Mobile Cards - 3 Column Grid */}
            <div className="grid grid-cols-3 gap-2">
              {isolationContainers.map((container) => (
                <div
                  key={container.label}
                  className="flex flex-col items-center gap-2 p-3 rounded-lg bg-secondary/50 border border-border"
                >
                  <div className="w-8 h-8 rounded-lg bg-background border border-border flex items-center justify-center">
                    <container.icon className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-mono text-muted-foreground">{container.label}</p>
                    <p className="text-[10px] font-mono font-medium text-foreground">{container.status}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Mobile Log - Isolation Log (same as desktop) */}
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Isolation Log</h3>
                <span className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success"></span>
                  </span>
                  Live
                </span>
              </div>
              <div className="bg-background rounded-lg border border-border overflow-hidden">
                <div className="divide-y divide-border">
                  {logEntries.slice(0, 4).map((entry, i) => (
                    <div key={i} className="flex items-center gap-2 px-2 py-1.5 text-[10px] font-mono">
                      <span className="text-muted-foreground shrink-0">{entry.time}</span>
                      <span className="text-muted-foreground shrink-0 w-14">{entry.agent}</span>
                      <span className="text-foreground truncate flex-1">{entry.action}</span>
                      <span
                        className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] ${
                          entry.status === "approved"
                            ? "bg-success/10 text-success"
                            : "bg-destructive/10 text-destructive"
                        }`}
                      >
                        {entry.status === "approved" ? "OK" : "BLOCK"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
