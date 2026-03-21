"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ArrowRight, ArrowLeft, Check, Terminal, AlertCircle, Loader2 } from "lucide-react"
import { Boxes } from "@/components/ui/background-boxes"
import { useFormSubmission } from "@/lib/form-submission"
import { Alert, AlertDescription } from "@/components/ui/alert"

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
  const [submissionId, setSubmissionId] = useState<string>()
  const { submitForm, isSubmitting, error, resetError } = useFormSubmission()
  
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

  const handleSubmit = async () => {
    resetError()
    
    // Convert techStack object to array format expected by API
    const techStackArray = Object.entries(formData.techStack).map(
      ([category, tool]) => `${category}: ${tool}`
    )
    
    const result = await submitForm({
      formType: "consultation",
      data: {
        name: formData.name,
        company: formData.company,
        email: formData.email,
        role: formData.role,
        teamSize: formData.teamSize,
        securityLevel: formData.securityLevel,
        techStack: techStackArray,
        compliance: formData.compliance,
        message: formData.message,
      },
      metadata: {
        url: typeof window !== "undefined" ? window.location.href : "",
      },
    })

    if (result.success) {
      setSubmissionId(result.id)
      setSubmitted(true)
    }
  }

  const handleStepChange = (newStep: number) => {
    resetError()
    setStep(newStep)
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
            Start your impact journey
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Tell us about your mission. We'll help you identify where AI agents can free up your team to focus on what matters most.
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <Alert variant="destructive" className="max-w-lg mx-auto mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

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
            {submissionId && (
              <p className="text-xs font-mono text-muted-foreground">
                Reference: {submissionId}
              </p>
            )}
          </div>
        ) : (
          /* Form */
          <div className="max-w-2xl mx-auto">
            {/* Progress Steps */}
            <div className="flex items-center justify-center gap-4 mb-12">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex items-center gap-4">
                  <button
                    onClick={() => s < step && handleStepChange(s)}
                    className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-mono text-sm transition-colors ${
                      s === step
                        ? "border-foreground bg-foreground text-background"
                        : s < step
                        ? "border-foreground bg-foreground/10"
                        : "border-border text-muted-foreground"
                    } ${s < step ? "cursor-pointer hover:bg-foreground/20" : "cursor-default"}`}
                    disabled={s >= step}
                  >
                    {s < step ? <Check className="w-4 h-4" /> : s}
                  </button>
                  {s < TOTAL_STEPS && (
                    <div className={`w-16 h-px ${s < step ? "bg-foreground" : "bg-border"}`} />
                  )}
                </div>
              ))}
            </div>

            {/* Form Card */}
            <div className="border border-border bg-card/50 backdrop-blur-sm rounded-xl p-8">
              {step === 1 && (
                <div className="space-y-6">
                  <h3 className="text-xl font-medium mb-6">About you</h3>
                  
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Name *</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                        className="w-full h-11 px-4 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Organization *</label>
                      <input
                        type="text"
                        value={formData.company}
                        onChange={(e) => setFormData((prev) => ({ ...prev, company: e.target.value }))}
                        className="w-full h-11 px-4 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="Organization name"
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Email *</label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                        className="w-full h-11 px-4 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="you@organization.org"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Role *</label>
                      <input
                        type="text"
                        value={formData.role}
                        onChange={(e) => setFormData((prev) => ({ ...prev, role: e.target.value }))}
                        className="w-full h-11 px-4 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="e.g. Operations Director"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Team Size</label>
                    <select
                      value={formData.teamSize}
                      onChange={(e) => setFormData((prev) => ({ ...prev, teamSize: e.target.value }))}
                      className="w-full h-11 px-4 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">Select team size...</option>
                      <option value="1-10">1-10 people</option>
                      <option value="11-50">11-50 people</option>
                      <option value="51-200">51-200 people</option>
                      <option value="201+">201+ people</option>
                    </select>
                  </div>

                  <div className="pt-4">
                    <Button
                      onClick={() => handleStepChange(2)}
                      disabled={!canProceed()}
                      className="w-full h-12"
                    >
                      Continue
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  <h3 className="text-xl font-medium mb-2">Current stack</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Select at least 3 categories. This helps us understand integration requirements.
                  </p>

                  <div className="space-y-4 max-h-80 overflow-y-auto pr-2">
                    {Object.entries(techStacks).map(([category, tools]) => (
                      <div key={category} className="border border-border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-medium text-sm">{category}</span>
                          {formData.techStack[category] && (
                            <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">
                              {formData.techStack[category]}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {tools.map((tool) => (
                            <button
                              key={tool}
                              onClick={() => updateTechStack(category, tool)}
                              className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                                formData.techStack[category] === tool
                                  ? "bg-foreground text-background border-foreground"
                                  : "bg-transparent border-border hover:border-foreground/50"
                              }`}
                            >
                              {tool}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => handleStepChange(1)}
                      className="h-12 px-6"
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Back
                    </Button>
                    <Button
                      onClick={() => handleStepChange(3)}
                      disabled={!canProceed()}
                      className="flex-1 h-12"
                    >
                      Continue
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6">
                  <h3 className="text-xl font-medium mb-2">Security & Requirements</h3>

                  <div>
                    <label className="block text-sm font-medium mb-3">Security Level</label>
                    <div className="grid gap-3">
                      {securityLevels.map((level) => (
                        <label
                          key={level.id}
                          className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                            formData.securityLevel === level.id
                              ? "border-foreground bg-foreground/5"
                              : "border-border hover:border-foreground/30"
                          }`}
                        >
                          <input
                            type="radio"
                            name="security"
                            value={level.id}
                            checked={formData.securityLevel === level.id}
                            onChange={(e) =>
                              setFormData((prev) => ({ ...prev, securityLevel: e.target.value }))
                            }
                            className="mt-0.5"
                          />
                          <div>
                            <div className="font-medium text-sm">{level.label}</div>
                            <div className="text-xs text-muted-foreground">{level.description}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-3">Compliance Requirements</label>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {complianceOptions.map((option) => (
                        <label
                          key={option.id}
                          className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                            formData.compliance.includes(option.id)
                              ? "border-foreground bg-foreground/5"
                              : "border-border hover:border-foreground/30"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={formData.compliance.includes(option.id)}
                            onChange={() => toggleCompliance(option.id)}
                            className="mt-0.5"
                          />
                          <div>
                            <div className="font-medium text-sm">{option.label}</div>
                            <div className="text-xs text-muted-foreground">{option.description}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Additional Context</label>
                    <textarea
                      value={formData.message}
                      onChange={(e) => setFormData((prev) => ({ ...prev, message: e.target.value }))}
                      rows={3}
                      className="w-full px-4 py-3 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                      placeholder="What workflows are you looking to automate? Any specific requirements?"
                    />
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => handleStepChange(2)}
                      disabled={isSubmitting}
                      className="h-12 px-6"
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Back
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={isSubmitting}
                      className="flex-1 h-12"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <Terminal className="w-4 h-4 mr-2" />
                          Submit Request
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
