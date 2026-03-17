import { Terminal } from "lucide-react"

export function Footer() {
  return (
    <footer className="border-t border-border py-16">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid md:grid-cols-4 gap-12 mb-12">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-foreground text-background rounded flex items-center justify-center">
                <Terminal className="w-4 h-4" />
              </div>
              <span className="font-mono text-lg font-medium tracking-tight">zaplit</span>
            </div>
            <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
              Boutique AI agent agency. White-glove deployment of pre-built agent teams. No subscriptions, just results.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">Product</h4>
            <div className="space-y-3">
              <a href="#agents" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">Agents</a>
              <a href="#security" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">Security</a>
              <a href="#plans" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">Plans</a>
              <a href="#calculator" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">Calculator</a>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">Company</h4>
            <div className="space-y-3">
              <a href="/about" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">About</a>
              <a href="/blog" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">Blog</a>
              <a href="/careers" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">Careers</a>
              <a href="/contact" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">Contact</a>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Zaplit. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <a href="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Privacy</a>
            <a href="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Terms</a>
            <a href="#security" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Security</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
