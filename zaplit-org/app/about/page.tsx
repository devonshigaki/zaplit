import Link from "next/link"
import { Terminal, ArrowLeft, Shield, Zap, Users, Bot } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function AboutPage() {
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
        <div className="max-w-7xl mx-auto px-6">
          {/* Hero */}
          <div className="max-w-3xl mb-20">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">About Us</p>
            <h1 className="text-4xl md:text-5xl font-serif italic mb-8 text-balance">
              Building the future of work with AI agents
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Zaplit is a boutique AI agent agency. We deploy pre-built agent teams that integrate 
              seamlessly into your existing workflows—with security guarantees that traditional 
              automation can't match.
            </p>
          </div>

          {/* Mission */}
          <div className="grid md:grid-cols-2 gap-12 mb-20">
            <div>
              <h2 className="text-2xl font-serif italic mb-4">Our Mission</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                We believe AI agents should augment human capabilities, not replace human judgment. 
                Every agent we deploy operates with strict isolation, role-based access, and human 
                approval workflows.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Our goal is to give businesses the productivity benefits of AI automation without 
                the security risks or unpredictable behavior that comes with unconstrained systems.
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="text-sm font-mono text-muted-foreground uppercase tracking-wider mb-6">Built with Zaplit</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                We use our own agent teams to run Zaplit. Our Secretary orchestrates workflows, 
                Research monitors market trends, and Support handles initial inquiries—all with 
                the same isolation and approval controls we provide to our clients.
              </p>
              <div className="flex items-center gap-2 text-sm">
                <Bot className="w-4 h-4 text-muted-foreground" />
                <span className="text-foreground font-medium">7 agents running Zaplit daily</span>
              </div>
            </div>
          </div>

          {/* Values */}
          <div className="mb-20">
            <h2 className="text-2xl font-serif italic mb-8">Our Values</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="w-10 h-10 rounded-lg bg-secondary border border-border flex items-center justify-center mb-4">
                  <Shield className="w-5 h-5 text-foreground" />
                </div>
                <h3 className="font-medium mb-2">Security First</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Every design decision starts with security. Agents operate in isolated containers 
                  with strict access controls and cannot exceed their boundaries.
                </p>
              </div>
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="w-10 h-10 rounded-lg bg-secondary border border-border flex items-center justify-center mb-4">
                  <Users className="w-5 h-5 text-foreground" />
                </div>
                <h3 className="font-medium mb-2">Human-Centered</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Agents assist, they don't replace. Critical decisions always require human approval. 
                  You stay in control of everything that matters.
                </p>
              </div>
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="w-10 h-10 rounded-lg bg-secondary border border-border flex items-center justify-center mb-4">
                  <Zap className="w-5 h-5 text-foreground" />
                </div>
                <h3 className="font-medium mb-2">Open Infrastructure</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Built on open source foundations. No vendor lock-in. You own your integrations, 
                  configurations, and data.
                </p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center border-t border-border pt-16">
            <h2 className="text-2xl md:text-3xl font-serif italic mb-4">
              Ready to meet your digital team?
            </h2>
            <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
              We'd love to understand your workflows and show you how our agents can help.
            </p>
            <Button asChild>
              <Link href="/#book-demo">Book a Consultation</Link>
            </Button>
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
