import Link from "next/link"
import { Terminal, ArrowLeft, ArrowRight, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { notFound } from "next/navigation"
import { posts } from "@/lib/blog-posts"

export async function generateStaticParams() {
  return posts.map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = posts.find((p) => p.slug === slug)
  if (!post) return {}
  return {
    title: `${post.title} — Zaplit Blog`,
    description: post.excerpt,
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = posts.find((p) => p.slug === slug)
  if (!post) notFound()

  const postIndex = posts.indexOf(post)
  const prev = posts[postIndex + 1] ?? null
  const next = posts[postIndex - 1] ?? null

  // Parse markdown-ish content into sections
  const sections = post.content.split("\n\n").map((block, i) => {
    if (block.startsWith("## ")) {
      return <h2 key={i} className="text-2xl font-serif italic mt-12 mb-4 text-foreground">{block.replace("## ", "")}</h2>
    }
    if (block.startsWith("**") && block.endsWith("**")) {
      return <p key={i} className="font-medium text-foreground mb-4">{block.replace(/\*\*/g, "")}</p>
    }
    // Handle inline bold
    const parts = block.split(/(\*\*[^*]+\*\*)/)
    const rendered = parts.map((part, j) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={j}>{part.replace(/\*\*/g, "")}</strong>
      }
      return part
    })
    return <p key={i} className="text-muted-foreground leading-relaxed mb-4">{rendered}</p>
  })

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
            <Link href="/blog">
              <ArrowLeft className="w-4 h-4 mr-2" />
              All Posts
            </Link>
          </Button>
        </div>
      </nav>

      <main className="pt-32 pb-24">
        <div className="max-w-2xl mx-auto px-6">
          {/* Header */}
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <span className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground font-mono">
                {post.category}
              </span>
              <span className="text-xs text-muted-foreground">{post.date}</span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                {post.readTime}
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-serif italic leading-tight mb-6 text-balance">
              {post.title}
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed border-l-2 border-border pl-4">
              {post.excerpt}
            </p>
          </div>

          {/* Divider */}
          <div className="border-t border-border mb-12" />

          {/* Content */}
          <div className="prose-zaplit">
            {sections}
          </div>

          {/* Divider */}
          <div className="border-t border-border mt-16 pt-12" />

          {/* Prev / Next */}
          <div className="grid grid-cols-2 gap-6">
            {prev ? (
              <Link
                href={`/blog/${prev.slug}`}
                className="group flex flex-col gap-1 bg-card border border-border rounded-xl p-4 hover:border-muted-foreground transition-colors"
              >
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <ArrowLeft className="w-3 h-3" /> Older
                </span>
                <span className="text-sm font-medium leading-snug group-hover:text-foreground transition-colors line-clamp-2">
                  {prev.title}
                </span>
              </Link>
            ) : <div />}
            {next ? (
              <Link
                href={`/blog/${next.slug}`}
                className="group flex flex-col gap-1 bg-card border border-border rounded-xl p-4 hover:border-muted-foreground transition-colors text-right col-start-2"
              >
                <span className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                  Newer <ArrowRight className="w-3 h-3" />
                </span>
                <span className="text-sm font-medium leading-snug group-hover:text-foreground transition-colors line-clamp-2">
                  {next.title}
                </span>
              </Link>
            ) : <div />}
          </div>

          {/* Back to blog */}
          <div className="mt-12 text-center">
            <Button variant="outline" asChild>
              <Link href="/blog">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to all posts
              </Link>
            </Button>
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
