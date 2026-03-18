import Link from "next/link"
import { Terminal, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function PrivacyPage() {
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
          <h1 className="text-4xl md:text-5xl font-serif italic mb-8">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground mb-12">Last updated: March 2026</p>

          <div className="prose prose-invert prose-zinc max-w-none space-y-8">
            <section className="space-y-4">
              <h2 className="text-xl font-medium">1. Information We Collect</h2>
              <p className="text-muted-foreground leading-relaxed">
                We collect information you provide directly, including account details, business 
                configurations, and communication preferences. We also collect usage data about 
                how you interact with our services and agent performance metrics.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-medium">2. How We Use Your Information</h2>
              <p className="text-muted-foreground leading-relaxed">
                We use collected information to provide and improve our services, configure and 
                deploy your agent teams, maintain security, and communicate with you about your 
                account and service updates.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-medium">3. Data Processing by Agents</h2>
              <p className="text-muted-foreground leading-relaxed">
                Our AI agents process data within your existing business systems through secure 
                integrations. Agents operate in isolated containers and cannot access data outside 
                their configured scope. All agent actions are logged and auditable.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-medium">4. Data Retention</h2>
              <p className="text-muted-foreground leading-relaxed">
                We retain operational logs and audit trails for security and compliance purposes. 
                Business data processed by agents remains in your systems—we do not store copies. 
                Account data is retained until you request deletion.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-medium">5. Data Security</h2>
              <p className="text-muted-foreground leading-relaxed">
                We implement industry-standard security measures including encryption in transit 
                and at rest, role-based access controls, and regular security audits. Our 
                infrastructure is SOC2 ready and GDPR compliant.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-medium">6. Third-Party Services</h2>
              <p className="text-muted-foreground leading-relaxed">
                We integrate with third-party services as configured during deployment. Each 
                integration is established with your explicit authorization. We do not sell or 
                share your data with third parties for their marketing purposes.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-medium">7. Your Rights</h2>
              <p className="text-muted-foreground leading-relaxed">
                You have the right to access, correct, or delete your personal information. You 
                can request data portability, restrict processing, or withdraw consent at any 
                time. Contact us to exercise these rights.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-medium">8. Contact Us</h2>
              <p className="text-muted-foreground leading-relaxed">
                For privacy-related inquiries, contact our Data Protection Officer at hi@zaplit.com.
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
            <Link href="/privacy" className="text-xs text-foreground">Privacy</Link>
            <Link href="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
