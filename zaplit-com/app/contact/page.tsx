"use client"

import { useState } from "react"
import Link from "next/link"
import { Terminal, ArrowLeft, Mail, MessageSquare, Building2, Check, AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useFormSubmission } from "@/lib/form-submission"

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false)
  const [submissionId, setSubmissionId] = useState<string>()
  const { submitForm, isSubmitting, error, resetError } = useFormSubmission()
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    resetError()

    const result = await submitForm({
      formType: "contact",
      data: formData,
      metadata: {
        url: typeof window !== "undefined" ? window.location.href : "",
      },
    })

    if (result.success) {
      setSubmissionId(result.id)
      setSubmitted(true)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-foreground text-background rounded flex items-center justify-center">
              <Terminal className="w-4 h-4" />
            </div>
            <span className="font-mono text-lg font-medium tracking-tight">zaplit</span>
          </Link>
          <Button variant="outline" size="sm" asChild>
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Link>
          </Button>
        </div>
      </nav>

      <main className="pt-32 pb-24">
        <div className="max-w-4xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-16">
            {/* Left - Info */}
            <div>
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">Contact</p>
              <h1 className="text-4xl md:text-5xl font-serif italic mb-6 text-balance">
                Let&apos;s talk
              </h1>
              <p className="text-muted-foreground leading-relaxed mb-12">
                Have questions about our agents? Want to discuss a deployment? 
                We&apos;d love to hear from you.
              </p>

              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-secondary border border-border flex items-center justify-center shrink-0">
                    <Mail className="w-5 h-5 text-foreground" />
                  </div>
                  <div>
                    <h3 className="font-medium mb-1">Email</h3>
                    <p className="text-sm text-muted-foreground">hi@zaplit.com</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-secondary border border-border flex items-center justify-center shrink-0">
                    <MessageSquare className="w-5 h-5 text-foreground" />
                  </div>
                  <div>
                    <h3 className="font-medium mb-1">Sales</h3>
                    <p className="text-sm text-muted-foreground">hi@zaplit.com</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-secondary border border-border flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-foreground" />
                  </div>
                  <div>
                    <h3 className="font-medium mb-1">Enterprise</h3>
                    <p className="text-sm text-muted-foreground">hi@zaplit.com</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right - Form */}
            <div className="bg-card border border-border rounded-xl p-6">
              {submitted ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-12">
                  <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mb-4">
                    <Check className="w-6 h-6 text-success" />
                  </div>
                  <h3 className="text-xl font-medium mb-2">Message sent</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    We&apos;ll get back to you within 24 hours.
                  </p>
                  {submissionId && (
                    <p className="text-xs font-mono text-muted-foreground">
                      Ref: {submissionId.slice(0, 8)}
                    </p>
                  )}
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  
                  <div>
                    <label className="text-sm font-medium mb-2 block">Name</label>
                    <Input 
                      placeholder="Your name" 
                      required 
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Email</label>
                    <Input 
                      type="email" 
                      placeholder="you@company.com" 
                      required 
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Subject</label>
                    <Input 
                      placeholder="How can we help?" 
                      required
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Message</label>
                    <textarea
                      className="w-full px-4 py-3 rounded-lg bg-secondary border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground resize-none disabled:opacity-50"
                      rows={4}
                      placeholder="How can we help?"
                      required
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      disabled={isSubmitting}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      "Send Message"
                    )}
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Zaplit. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
