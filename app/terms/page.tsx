import Link from "next/link"
import { Terminal, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function TermsPage() {
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
        <div className="max-w-3xl mx-auto px-6">
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">Legal</p>
          <h1 className="text-4xl md:text-5xl font-serif italic mb-8">Terms of Service</h1>
          <p className="text-sm text-muted-foreground mb-12">Last updated: March 2026</p>

          <div className="prose prose-invert prose-zinc max-w-none space-y-8">
            <section className="space-y-4">
              <h2 className="text-xl font-medium">1. Agreement to Terms</h2>
              <p className="text-muted-foreground leading-relaxed">
                By accessing or using Zaplit's AI agent services, you agree to be bound by these Terms of Service. 
                If you disagree with any part of these terms, you may not access our services.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-medium">2. Service Description</h2>
              <p className="text-muted-foreground leading-relaxed">
                Zaplit provides pre-built AI agent teams for business automation. Our agents operate within 
                isolated, sandboxed environments with strict access controls. All agent actions are logged 
                and subject to human approval workflows as configured during deployment.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-medium">3. User Responsibilities</h2>
              <p className="text-muted-foreground leading-relaxed">
                You are responsible for maintaining the confidentiality of your account credentials, 
                configuring appropriate approval thresholds, and monitoring agent activity. You agree 
                not to use our services for any unlawful purposes or in violation of these terms.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-medium">4. Data Processing</h2>
              <p className="text-muted-foreground leading-relaxed">
                Agents process data within your existing systems via secure integrations. We do not 
                store or retain business data beyond what is necessary for service operation. All 
                data processing complies with applicable data protection regulations.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-medium">5. Security Guarantees</h2>
              <p className="text-muted-foreground leading-relaxed">
                Our agents operate in isolated containers with role-based access control. Database 
                access is read-only unless explicitly configured otherwise. All communications are 
                draft-only with bulk sends requiring human approval. Emergency kill switches are 
                always available.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-medium">6. Limitation of Liability</h2>
              <p className="text-muted-foreground leading-relaxed">
                Zaplit shall not be liable for any indirect, incidental, special, consequential, or 
                punitive damages resulting from your use of our services. Our total liability is 
                limited to the amounts paid by you in the twelve months preceding the claim.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-medium">7. Modifications</h2>
              <p className="text-muted-foreground leading-relaxed">
                We reserve the right to modify these terms at any time. We will notify users of 
                significant changes via email or through our services. Continued use after changes 
                constitutes acceptance of the modified terms.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-medium">8. Contact</h2>
              <p className="text-muted-foreground leading-relaxed">
                For questions about these Terms of Service, please contact us at hi@zaplit.com.
              </p>
            </section>
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
            <Link href="/terms" className="text-xs text-foreground">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
