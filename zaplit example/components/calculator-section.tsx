"use client"

import { useState, useMemo } from "react"
import { Workflow, Search, Shield, Megaphone, UserPlus, Receipt, HeadphonesIcon } from "lucide-react"

const agentData = [
  { id: "secretary", name: "Secretary", icon: Workflow, salary: 95000, buildCost: 12000, maintenance: 2400 },
  { id: "research", name: "Research", icon: Search, salary: 85000, buildCost: 10000, maintenance: 1800 },
  { id: "security", name: "Security", icon: Shield, salary: 110000, buildCost: 18000, maintenance: 3000 },
  { id: "marketing", name: "Marketing", icon: Megaphone, salary: 85000, buildCost: 14000, maintenance: 2400 },
  { id: "lead", name: "Lead", icon: UserPlus, salary: 75000, buildCost: 12000, maintenance: 2000 },
  { id: "billing", name: "Billing", icon: Receipt, salary: 70000, buildCost: 10000, maintenance: 1800 },
  { id: "support", name: "Support", icon: HeadphonesIcon, salary: 50000, buildCost: 8000, maintenance: 1200 },
]

export function CalculatorSection() {
  const [selectedAgents, setSelectedAgents] = useState<string[]>(["secretary"])
  const [teamSize, setTeamSize] = useState(1)
  const [years, setYears] = useState(3)

  const toggleAgent = (agentId: string) => {
    if (agentId === "secretary") return // Secretary is always included
    setSelectedAgents((prev) =>
      prev.includes(agentId) ? prev.filter((a) => a !== agentId) : [...prev, agentId]
    )
  }

  const calculations = useMemo(() => {
    const selected = agentData.filter((a) => selectedAgents.includes(a.id))
    
    const totalHumanSalary = selected.reduce((sum, a) => sum + a.salary, 0) * teamSize
    const totalHumanCost = totalHumanSalary * years
    
    const totalBuildCost = selected.reduce((sum, a) => sum + a.buildCost, 0)
    const totalMaintenance = selected.reduce((sum, a) => sum + a.maintenance, 0) * years
    const totalAgentCost = totalBuildCost + totalMaintenance
    
    const savings = totalHumanCost - totalAgentCost
    const savingsPercentage = totalHumanCost > 0 ? (savings / totalHumanCost) * 100 : 0
    
    const monthlyHumanCost = totalHumanSalary / 12
    const paybackMonths = monthlyHumanCost > 0 ? Math.ceil(totalBuildCost / monthlyHumanCost) : 0
    
    const annualSavingsAfterPayback = totalHumanSalary - (totalMaintenance / years)

    return {
      totalHumanCost,
      totalAgentCost,
      savings,
      savingsPercentage,
      paybackMonths,
      annualSavingsAfterPayback,
      totalBuildCost,
      totalMaintenance,
    }
  }, [selectedAgents, teamSize, years])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  return (
    <section id="calculator" className="py-32 border-t border-border">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <div className="max-w-2xl mb-16">
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">ROI Calculator</p>
          <h2 className="text-4xl md:text-5xl font-serif italic mb-6 text-balance">
            Calculate your savings
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Compare the cost of human employees versus AI agents over time. One-time build cost plus minimal maintenance.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Configuration */}
          <div className="space-y-8">
            {/* Agent Selection */}
            <div>
              <h3 className="text-sm font-mono text-muted-foreground uppercase tracking-wider mb-4">Select Agents</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {agentData.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => toggleAgent(agent.id)}
                    disabled={agent.id === "secretary"}
                    className={`p-4 rounded-lg border text-left transition-all ${
                      selectedAgents.includes(agent.id)
                        ? "border-foreground bg-secondary/50"
                        : "border-border hover:border-muted-foreground"
                    } ${agent.id === "secretary" ? "opacity-60" : ""}`}
                  >
                    <agent.icon className="w-5 h-5 mb-2 text-foreground" />
                    <p className="text-sm font-medium">{agent.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{formatCurrency(agent.salary)}/yr</p>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">Secretary is always included as the orchestrator</p>
            </div>

            {/* Team Size Slider */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-mono text-muted-foreground uppercase tracking-wider">Team Size</h3>
                <span className="text-sm font-mono">{teamSize}x per role</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={teamSize}
                onChange={(e) => setTeamSize(parseInt(e.target.value))}
                className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-foreground"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>1</span>
                <span>10</span>
              </div>
            </div>

            {/* Timeframe Slider */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-mono text-muted-foreground uppercase tracking-wider">Timeframe</h3>
                <span className="text-sm font-mono">{years} year{years > 1 ? "s" : ""}</span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                value={years}
                onChange={(e) => setYears(parseInt(e.target.value))}
                className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-foreground"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>1 year</span>
                <span>5 years</span>
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="space-y-6">
            {/* Cost Comparison Bars */}
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="text-sm font-mono text-muted-foreground uppercase tracking-wider mb-6">Cost Comparison</h3>
              
              <div className="space-y-6">
                {/* Human Cost */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Human employees</span>
                    <span className="font-mono text-sm">{formatCurrency(calculations.totalHumanCost)}</span>
                  </div>
                  <div className="h-3 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-muted-foreground rounded-full transition-all duration-500"
                      style={{ width: "100%" }}
                    />
                  </div>
                </div>

                {/* Agent Cost */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">AI agents</span>
                    <span className="font-mono text-sm">{formatCurrency(calculations.totalAgentCost)}</span>
                  </div>
                  <div className="h-3 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-foreground rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, (calculations.totalAgentCost / calculations.totalHumanCost) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Cost Breakdown */}
              <div className="mt-6 pt-6 border-t border-border grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Build cost (one-time)</p>
                  <p className="font-mono">{formatCurrency(calculations.totalBuildCost)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Maintenance ({years}yr)</p>
                  <p className="font-mono">{formatCurrency(calculations.totalMaintenance)}</p>
                </div>
              </div>
            </div>

            {/* Savings Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-card border border-border rounded-xl p-6">
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Total Savings</p>
                <p className="text-3xl font-mono font-medium text-success">{formatCurrency(calculations.savings)}</p>
                <p className="text-sm text-muted-foreground mt-1">{calculations.savingsPercentage.toFixed(0)}% reduction</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-6">
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Payback Period</p>
                <p className="text-3xl font-mono font-medium">{calculations.paybackMonths}</p>
                <p className="text-sm text-muted-foreground mt-1">months</p>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-6">
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Annual Savings After Payback</p>
              <p className="text-3xl font-mono font-medium">{formatCurrency(calculations.annualSavingsAfterPayback)}</p>
              <p className="text-sm text-muted-foreground mt-1">per year</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
