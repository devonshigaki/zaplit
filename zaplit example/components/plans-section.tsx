"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Check, Workflow, Search, Shield, Megaphone, UserPlus, Receipt, HeadphonesIcon } from "lucide-react"

const plans = [
  {
    id: "operations",
    name: "Operations",
    description: "Central coordination and workflow automation",
    agents: [{ name: "Secretary", icon: Workflow }],
    features: ["Workflow orchestration", "Task delegation", "Priority management", "Cross-team coordination"],
  },
  {
    id: "product",
    name: "Product",
    description: "Research, security, and marketing intelligence",
    agents: [
      { name: "Research", icon: Search },
      { name: "Security", icon: Shield },
      { name: "Marketing", icon: Megaphone },
    ],
    features: ["Market intelligence", "Threat detection", "Content creation", "Compliance monitoring"],
  },
  {
    id: "service",
    name: "Service",
    description: "Customer-facing operations and revenue",
    agents: [
      { name: "Lead", icon: UserPlus },
      { name: "Billing", icon: Receipt },
      { name: "Support", icon: HeadphonesIcon },
    ],
    features: ["Sales development", "Invoice automation", "Ticket resolution", "CRM management"],
  },
]

export function PlansSection() {
  const [selectedPlans, setSelectedPlans] = useState<string[]>([])

  const togglePlan = (planId: string) => {
    setSelectedPlans((prev) =>
      prev.includes(planId) ? prev.filter((p) => p !== planId) : [...prev, planId]
    )
  }

  const selectAll = () => {
    if (selectedPlans.length === plans.length) {
      setSelectedPlans([])
    } else {
      setSelectedPlans(plans.map((p) => p.id))
    }
  }

  return (
    <section id="plans" className="py-32 border-t border-border">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <div className="max-w-2xl mb-16">
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">Configuration</p>
          <h2 className="text-4xl md:text-5xl font-serif italic mb-6 text-balance">
            Build your digital organization
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Select the departments you need. All configurations include the Secretary orchestrator. Pricing is custom based on your tech stack complexity.
          </p>
        </div>

        {/* Plans Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {plans.map((plan) => (
            <div
              key={plan.id}
              onClick={() => togglePlan(plan.id)}
              className={`relative bg-card border rounded-xl p-6 cursor-pointer transition-all ${
                selectedPlans.includes(plan.id)
                  ? "border-foreground ring-1 ring-foreground"
                  : "border-border hover:border-muted-foreground"
              }`}
            >
              {/* Selection Indicator */}
              <div
                className={`absolute top-4 right-4 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                  selectedPlans.includes(plan.id)
                    ? "border-foreground bg-foreground"
                    : "border-border"
                }`}
              >
                {selectedPlans.includes(plan.id) && (
                  <Check className="w-3.5 h-3.5 text-background" />
                )}
              </div>

              {/* Plan Content */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-medium mb-2">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                </div>

                {/* Agents */}
                <div className="flex gap-2">
                  {plan.agents.map((agent) => (
                    <div
                      key={agent.name}
                      className="w-10 h-10 rounded-lg bg-secondary border border-border flex items-center justify-center"
                      title={agent.name}
                    >
                      <agent.icon className="w-5 h-5 text-foreground" />
                    </div>
                  ))}
                </div>

                {/* Features */}
                <div className="space-y-2">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Complete Organization Option */}
        <div
          onClick={selectAll}
          className={`bg-card border rounded-xl p-6 cursor-pointer transition-all mb-8 ${
            selectedPlans.length === plans.length
              ? "border-foreground ring-1 ring-foreground"
              : "border-border hover:border-muted-foreground"
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                  selectedPlans.length === plans.length
                    ? "border-foreground bg-foreground"
                    : "border-border"
                }`}
              >
                {selectedPlans.length === plans.length && (
                  <Check className="w-3.5 h-3.5 text-background" />
                )}
              </div>
              <div>
                <h3 className="text-xl font-medium">Complete Organization</h3>
                <p className="text-sm text-muted-foreground">All 7 agents across all departments</p>
              </div>
            </div>
            <div className="flex gap-2">
              {plans.flatMap((p) => p.agents).map((agent) => (
                <div
                  key={agent.name}
                  className="w-8 h-8 rounded-lg bg-secondary border border-border flex items-center justify-center"
                  title={agent.name}
                >
                  <agent.icon className="w-4 h-4 text-foreground" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-4">
            {selectedPlans.length > 0
              ? `${selectedPlans.length} department${selectedPlans.length > 1 ? "s" : ""} selected`
              : "Select departments to configure your team"}
          </p>
          {selectedPlans.length > 0 ? (
            <Button size="lg" asChild>
              <a href="#book-demo">Book Consultation</a>
            </Button>
          ) : (
            <Button size="lg" disabled className="opacity-50 cursor-not-allowed">
              Book Consultation
            </Button>
          )}
          <p className="text-xs text-muted-foreground mt-3">Custom pricing based on tech stack assessment</p>
        </div>
      </div>
    </section>
  )
}
