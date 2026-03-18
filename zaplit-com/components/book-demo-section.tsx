"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ArrowRight, ArrowLeft, Check, Terminal } from "lucide-react"
import { Boxes } from "@/components/ui/background-boxes"

const techStacks = {
  CRM: ["Salesforce", "HubSpot", "Pipedrive", "Zoho", "None"],
  Communication: ["Slack", "Microsoft Teams", "Discord", "Email only", "None"],
  Finance: ["Stripe", "QuickBooks", "Xero", "FreshBooks", "None"],
  Productivity: ["Notion", "Airtable", "Monday.com", "Asana", "None"],
  Support: ["Zendesk", "Intercom", "Freshdesk", "HelpScout", "None"],
  Infrastructure: ["AWS", "Google Cloud", "Azure", "Self-hosted", "None"],
}

const complianceOptions = [
  { id: "soc2", label: "SOC 2", description: "Service Organization Controls" },
  { id: "gdpr", label: "GDPR", description: "EU data protection regulation" },
  { id: "hipaa", label: "HIPAA", description: "Healthcare data standards" },
  { id: "pci", label: "PCI-DSS", description: "Payment card industry" },
]

const securityLevels = [
  { id: "standard", label: "Standard", description: "Isolation + approval queue" },
  { id: "high", label: "High", description: "All actions logged + reviewed" },
  { id: "enterprise", label: "Enterprise", description: "Custom controls + audit" },
]

export function BookDemoSection() {
  const [step, setStep] = useState(1)
  const [submitted, setSubmitted] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    company: "",
    email: "",
    role: "",
    securityLevel: "standard",
    techStack: {} as Record<string, string>,
    compliance: [] as string[],
    teamSize: "",
    message: "",
  })

  const updateTechStack = (category: string, value: string) => {
    setFormData((prev) => ({ ...prev, techStack: { ...prev.techStack, [category]: value } }))
  }

  const toggleCompliance = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      compliance: prev.compliance.includes(id)
        ? prev.compliance.filter((c) => c !== id)
        : [...prev.compliance, id],
    }))
  }

  const canProceed = () => {
    if (step === 1) return formData.name.trim() && formData.company.trim() && formData.email.trim() && formData.role.trim()
    if (step === 2) return Object.keys(formData.techStack).length >= 3
    return true
  }

  const handleSubmit = () => {
    setSubmitted(true)
  }

  const TOTAL_STEPS = 3

  return (
    <section id="book-demo" className="py-32 border-t border-border relative overflow-hidden">
      {/* Background Boxes */}
      <div className="absolute inset-0 w-full h-full">
        <Boxes />
      </div>
      <div className="absolute inset-0 w-full h-full bg-gradient-to-b from-background via-background/80 to-background z-10 pointer-events-none" />
      
      <div className="max-w-4xl mx-auto px-6 relative z-20">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">Get Started</p>
          <h2 className="text-4xl md:text-5xl font-serif italic mb-6 text-balance">
            Book a consultation
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Tell us about your stack. We'll match you with the right agent team and walk you through setup.
          </p>
        </div>

        {submitted ? (
          /* Success State */
          <div className="max-w-lg mx-auto text-center">
            <div className="w-16 h-16 rounded-full bg-secondary border border-border flex items-center justify-center mx-auto mb-6">
              <Check className="w-7 h-7 text-foreground" />
            </div>
            <h3 className="text-2xl font-medium mb-3">Request received</h3>
            <p className="text-muted-foreground leading-relaxed mb-8">
              We review each submission manually. Expect a response within one business day at{" "}
              <span className="text-foreground font-mono text-sm">{formData.email}</span>.
            </p>
            <div className="bg-background border border-border rounded-xl p-6 text-left space-y-3">
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">Summary</p>
              {[
                ["Contact", formData.name],
                ["Company", formData.company],
                ["Role", formData.role],
                ["Security level", securityLevels.find(s => s.id === formData.securityLevel)?.label ?? formData.securityLevel],
                ["Compliance", formData.compliance.length ? formData.compliance.join(", ").toUpperCase() : "None"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-mono">{v}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto">
            {/* Step indicator */}
            <div className="flex items-center gap-3 mb-10">
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
                const s = i + 1
                const active = s === step
                const done = s < step
                return (
                  <div key={s} className="flex items-center gap-3 flex-1">
                    <div className={`w-7 h-7 rounded-full border flex items-center justify-center flex-shrink-0 text-xs font-mono transition-colors ${
                      done ? "bg-foreground border-foreground text-background" :
                      active ? "border-foreground text-foreground" :
                      "border-border text-muted-foreground"
                    }`}>
                      {done ? <Check className="w-3.5 h-3.5" /> : s}
                    </div>
                    <span className={`text-sm hidden sm:block transition-colors ${active ? "text-foreground" : "text-muted-foreground"}`}>
                      {["Contact", "Tech stack", "Security"][i]}
                    </span>
                    {s < TOTAL_STEPS && <div className={`h-px flex-1 transition-colors ${done ? "bg-foreground" : "bg-border"}`} />}
                  </div>
                )
              })}
            </div>

            {/* Step 1 — Contact */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-xl font-medium mb-1">Contact information</h3>
                  <p className="text-sm text-muted-foreground">Who should we reach out to?</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-sm font-medium mb-2">Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:border-foreground focus:outline-none transition-colors text-sm font-mono"
                      placeholder="Your name"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-sm font-medium mb-2">Role</label>
                    <input
                      type="text"
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:border-foreground focus:outline-none transition-colors text-sm font-mono"
                      placeholder="CTO, Head of Ops…"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-2">Company</label>
                    <input
                      type="text"
                      value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:border-foreground focus:outline-none transition-colors text-sm font-mono"
                      placeholder="Company name"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-2">Work email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:border-foreground focus:outline-none transition-colors text-sm font-mono"
                      placeholder="you@company.com"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-2">Team size</label>
                    <div className="grid grid-cols-4 gap-2">
                      {["1–10", "11–50", "51–200", "200+"].map((size) => (
                        <button
                          key={size}
                          type="button"
                          onClick={() => setFormData({ ...formData, teamSize: size })}
                          className={`px-3 py-2.5 rounded-lg border text-sm font-mono transition-colors ${
                            formData.teamSize === size
                              ? "border-foreground bg-secondary text-foreground"
                              : "border-border text-muted-foreground hover:border-muted-foreground"
                          }`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2 — Tech Stack */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-xl font-medium mb-1">Current tech stack</h3>
                  <p className="text-sm text-muted-foreground">Select at least 3 categories so we can map your integrations.</p>
                </div>
                <div className="space-y-3">
                  {Object.entries(techStacks).map(([category, options]) => (
                    <div key={category} className="grid grid-cols-[120px_1fr] items-center gap-4">
                      <label className="text-sm font-medium text-muted-foreground">{category}</label>
                      <div className="flex flex-wrap gap-2">
                        {options.map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => updateTechStack(category, formData.techStack[category] === opt ? "" : opt)}
                            className={`px-3 py-1.5 rounded-md border text-xs font-mono transition-colors ${
                              formData.techStack[category] === opt
                                ? "border-foreground bg-secondary text-foreground"
                                : "border-border text-muted-foreground hover:border-muted-foreground"
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs font-mono text-muted-foreground">
                  {Object.values(formData.techStack).filter(Boolean).length} / {Object.keys(techStacks).length} categories selected
                </p>
              </div>
            )}

            {/* Step 3 — Security */}
            {step === 3 && (
              <div className="space-y-7">
                <div>
                  <h3 className="text-xl font-medium mb-1">Security & compliance</h3>
                  <p className="text-sm text-muted-foreground">Helps us configure the right isolation level from day one.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-3">Security priority</label>
                  <div className="grid grid-cols-3 gap-3">
                    {securityLevels.map((level) => (
                      <button
                        key={level.id}
                        type="button"
                        onClick={() => setFormData({ ...formData, securityLevel: level.id })}
                        className={`p-4 rounded-lg border text-left transition-colors ${
                          formData.securityLevel === level.id
                            ? "border-foreground bg-secondary"
                            : "border-border hover:border-muted-foreground"
                        }`}
                      >
                        <p className="text-sm font-medium mb-1">{level.label}</p>
                        <p className="text-xs text-muted-foreground leading-snug">{level.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-3">Compliance requirements</label>
                  <div className="grid grid-cols-2 gap-3">
                    {complianceOptions.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggleCompliance(opt.id)}
                        className={`p-4 rounded-lg border text-left flex items-start justify-between gap-2 transition-colors ${
                          formData.compliance.includes(opt.id)
                            ? "border-foreground bg-secondary"
                            : "border-border hover:border-muted-foreground"
                        }`}
                      >
                        <div>
                          <p className="text-sm font-medium font-mono">{opt.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                        </div>
                        {formData.compliance.includes(opt.id) && (
                          <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Anything else we should know?</label>
                  <textarea
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:border-foreground focus:outline-none transition-colors text-sm font-mono resize-none"
                    placeholder="Special requirements, timeline, current pain points…"
                  />
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-10 pt-6 border-t border-border">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
              ) : (
                <div />
              )}

              {step < TOTAL_STEPS ? (
                <Button
                  onClick={() => setStep(step + 1)}
                  disabled={!canProceed()}
                  className="gap-2"
                >
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button onClick={handleSubmit} className="gap-2">
                  Submit request
                  <ArrowRight className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Trust bar */}
        {!submitted && (
          <div className="flex items-center justify-center gap-6 mt-16 pt-8 border-t border-border">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Terminal className="w-3.5 h-3.5" />
              <span className="font-mono">No sales pressure</span>
            </div>
            <div className="w-px h-4 bg-border" />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Check className="w-3.5 h-3.5" />
              <span className="font-mono">Response within 1 business day</span>
            </div>
            <div className="w-px h-4 bg-border hidden sm:block" />
            <div className="items-center gap-2 text-xs text-muted-foreground hidden sm:flex">
              <Check className="w-3.5 h-3.5" />
              <span className="font-mono">White-glove onboarding</span>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
