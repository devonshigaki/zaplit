import Link from "next/link"
import { Terminal, ArrowLeft, MapPin, Clock, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

const openings = [
  {
    title: "Senior AI Engineer",
    department: "Engineering",
    location: "Remote",
    type: "Full-time",
    description: "Build and deploy AI agent systems with a focus on security and reliability.",
  },
  {
    title: "Solutions Architect",
    department: "Customer Success",
    location: "Remote",
    type: "Full-time",
    description: "Design and implement agent deployments for enterprise clients.",
  },
  {
    title: "Security Engineer",
    department: "Engineering",
    location: "Remote",
    type: "Full-time",
    description: "Strengthen our isolation systems and develop new security controls.",
  },
]

export default function CareersPage() {
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
          {/* Header */}
          <div className="mb-16">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">Careers</p>
            <h1 className="text-4xl md:text-5xl font-serif italic mb-6 text-balance">
              Build the future of AI automation
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl">
              We're a small team building AI agents that businesses can actually trust. 
              Join us in creating secure, human-centered automation.
            </p>
          </div>

          {/* Culture */}
          <div className="grid md:grid-cols-3 gap-6 mb-16">
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="font-medium mb-2">Remote-First</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Work from anywhere. We're distributed across time zones and async by default.
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="font-medium mb-2">Open Source Values</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We build on open infrastructure and contribute back to the community.
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="font-medium mb-2">Security Obsessed</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Every decision starts with security. It's not a feature—it's our foundation.
              </p>
            </div>
          </div>

          {/* Openings */}
          <div className="mb-16">
            <h2 className="text-2xl font-serif italic mb-8">Open Positions</h2>
            <div className="space-y-4">
              {openings.map((job) => (
                <div 
                  key={job.title}
                  className="group bg-card border border-border rounded-xl p-6 hover:border-muted-foreground transition-colors cursor-pointer"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-medium">{job.title}</h3>
                        <span className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground">
                          {job.department}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{job.description}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          <span>{job.location}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{job.type}</span>
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* No fit */}
          <div className="text-center border-t border-border pt-16">
            <h2 className="text-2xl font-serif italic mb-4">Don't see your role?</h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              We're always looking for talented people who share our vision. Send us a note.
            </p>
            <Button asChild>
              <Link href="/contact">Get in Touch</Link>
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
