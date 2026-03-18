"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { X, ArrowRight, ArrowLeft, Check } from "lucide-react"

interface BookingModalProps {
  isOpen: boolean
  onClose: () => void
}

const techStacks = {
  crm: ["Salesforce", "HubSpot", "Pipedrive", "Zoho", "Other"],
  communication: ["Slack", "Microsoft Teams", "Discord", "Email only", "Other"],
  finance: ["Stripe", "QuickBooks", "Xero", "FreshBooks", "Other"],
  productivity: ["Notion", "Airtable", "Monday.com", "Asana", "Other"],
  support: ["Zendesk", "Intercom", "Freshdesk", "HelpScout", "Other"],
  infrastructure: ["AWS", "Google Cloud", "Azure", "Self-hosted", "Other"],
}

const complianceOptions = ["SOC2", "GDPR", "HIPAA", "PCI-DSS"]

export function BookingModal({ isOpen, onClose }: BookingModalProps) {
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState({
    name: "",
    company: "",
    email: "",
    securityLevel: "standard",
    techStack: {} as Record<string, string>,
    compliance: [] as string[],
  })

  if (!isOpen) return null

  const updateTechStack = (category: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      techStack: { ...prev.techStack, [category]: value },
    }))
  }

  const toggleCompliance = (option: string) => {
    setFormData((prev) => ({
      ...prev,
      compliance: prev.compliance.includes(option)
        ? prev.compliance.filter((c) => c !== option)
        : [...prev.compliance, option],
    }))
  }

  const canProceed = () => {
    if (step === 1) return formData.name && formData.company && formData.email
    if (step === 2) return Object.keys(formData.techStack).length >= 2
    return true
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative bg-card border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium">Book Consultation</h2>
            <p className="text-xs text-muted-foreground">Step {step} of 4</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress */}
        <div className="px-6 py-3 border-b border-border">
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  s <= step ? "bg-foreground" : "bg-secondary"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-medium mb-2">Basic Information</h3>
                <p className="text-sm text-muted-foreground">Tell us about yourself and your company.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:border-foreground focus:outline-none transition-colors"
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Company</label>
                  <input
                    type="text"
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:border-foreground focus:outline-none transition-colors"
                    placeholder="Company name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:border-foreground focus:outline-none transition-colors"
                    placeholder="you@company.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Security Priority Level</label>
                  <div className="grid grid-cols-3 gap-3">
                    {["standard", "high", "enterprise"].map((level) => (
                      <button
                        key={level}
                        onClick={() => setFormData({ ...formData, securityLevel: level })}
                        className={`px-4 py-2 rounded-lg border text-sm font-medium capitalize transition-colors ${
                          formData.securityLevel === level
                            ? "border-foreground bg-secondary"
                            : "border-border hover:border-muted-foreground"
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-medium mb-2">Tech Stack</h3>
                <p className="text-sm text-muted-foreground">Select your current tools in each category.</p>
              </div>

              <div className="space-y-4">
                {Object.entries(techStacks).map(([category, options]) => (
                  <div key={category}>
                    <label className="block text-sm font-medium mb-2 capitalize">{category}</label>
                    <select
                      value={formData.techStack[category] || ""}
                      onChange={(e) => updateTechStack(category, e.target.value)}
                      className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:border-foreground focus:outline-none transition-colors appearance-none"
                    >
                      <option value="">Select {category}</option>
                      {options.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-medium mb-2">Compliance Requirements</h3>
                <p className="text-sm text-muted-foreground">Select all applicable compliance standards.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {complianceOptions.map((option) => (
                  <button
                    key={option}
                    onClick={() => toggleCompliance(option)}
                    className={`px-4 py-4 rounded-lg border text-left transition-colors ${
                      formData.compliance.includes(option)
                        ? "border-foreground bg-secondary"
                        : "border-border hover:border-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{option}</span>
                      {formData.compliance.includes(option) && (
                        <Check className="w-4 h-4" />
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">
                {"Don't see your requirement? Mention it during the consultation."}
              </p>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-medium mb-2">Schedule Consultation</h3>
                <p className="text-sm text-muted-foreground">{"Choose a time that works for you."}</p>
              </div>

              <div className="bg-secondary/50 border border-border rounded-lg p-6 text-center">
                <p className="text-muted-foreground mb-4">Calendar integration coming soon</p>
                <p className="text-sm text-muted-foreground">{"For now, we'll email you to schedule."}</p>
              </div>

              <div className="bg-card border border-border rounded-lg p-4">
                <h4 className="text-sm font-medium mb-3">Summary</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Contact</span>
                    <span>{formData.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Company</span>
                    <span>{formData.company}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Security Level</span>
                    <span className="capitalize">{formData.securityLevel}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Compliance</span>
                    <span>{formData.compliance.join(", ") || "None selected"}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          {step > 1 ? (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          ) : (
            <div />
          )}
          
          {step < 4 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canProceed()}>
              Continue
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={onClose}>
              Submit Request
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
