import Link from "next/link"
import { Terminal, ArrowLeft, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { posts } from "@/lib/blog-posts"

export default function BlogPage() {
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
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">Blog</p>
            <h1 className="text-4xl md:text-5xl font-serif italic mb-6 text-balance">
              Thoughts on AI agents and automation
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Insights from building secure, human-centered AI agent teams.
            </p>
          </div>

          {/* Posts */}
          <div className="space-y-6">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group block bg-card border border-border rounded-xl p-6 hover:border-muted-foreground transition-colors"
              >
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground">
                    {post.category}
                  </span>
                  <span className="text-xs text-muted-foreground">{post.date}</span>
                  <span className="text-xs text-muted-foreground">{post.readTime}</span>
                </div>
                <h2 className="text-xl font-medium mb-2">
                  {post.title}
                </h2>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  {post.excerpt}
                </p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                  <span>Read more</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            ))}
          </div>

          {/* Newsletter */}
          <div className="mt-16 border-t border-border pt-16 text-center">
            <h2 className="text-2xl font-serif italic mb-4">Stay updated</h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Get notified about new posts on AI agents, security, and automation.
            </p>
            <form className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto" aria-label="Newsletter subscription">
              <label htmlFor="newsletter-email" className="sr-only">Email address</label>
              <input
                id="newsletter-email"
                type="email"
                placeholder="your@email.com"
                className="flex-1 px-4 py-2 rounded-lg bg-secondary border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
                aria-required="true"
              />
              <Button type="submit">Subscribe</Button>
            </form>
          </div>
        </div>
      </main>

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
