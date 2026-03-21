import dynamic from "next/dynamic";
import { Navigation } from "@/components/navigation"
import { Hero } from "@/components/hero"
import { Footer } from "@/components/footer"

// Dynamically import below-the-fold sections for better performance
const SecuritySection = dynamic(() => import("@/components/security-section").then((mod) => mod.SecuritySection), {
  loading: () => <div className="h-96 animate-pulse bg-muted/20" />,
});

const AgentsSection = dynamic(() => import("@/components/agents-section").then((mod) => mod.AgentsSection), {
  loading: () => <div className="h-96 animate-pulse bg-muted/20" />,
});

const SolutionsSection = dynamic(() => import("@/components/solutions-section").then((mod) => mod.SolutionsSection), {
  loading: () => <div className="h-96 animate-pulse bg-muted/20" />,
});

const PlansSection = dynamic(() => import("@/components/plans-section").then((mod) => mod.PlansSection), {
  loading: () => <div className="h-96 animate-pulse bg-muted/20" />,
});

const CalculatorSection = dynamic(() => import("@/components/calculator-section").then((mod) => mod.CalculatorSection), {
  loading: () => <div className="h-96 animate-pulse bg-muted/20" />,
});

const IntegrationsSection = dynamic(() => import("@/components/integrations-section").then((mod) => mod.IntegrationsSection), {
  loading: () => <div className="h-96 animate-pulse bg-muted/20" />,
});

const FAQSection = dynamic(() => import("@/components/faq-section").then((mod) => mod.FAQSection), {
  loading: () => <div className="h-96 animate-pulse bg-muted/20" />,
});

const BookDemoSection = dynamic(() => import("@/components/book-demo-section").then((mod) => mod.BookDemoSection), {
  loading: () => <div className="h-96 animate-pulse bg-muted/20" />,
});

export default function Home() {
  return (
    <main id="main-content" className="min-h-screen">
      <Navigation />
      <Hero />
      <SecuritySection />
      <AgentsSection />
      <SolutionsSection />
      <PlansSection />
      <CalculatorSection />
      <IntegrationsSection />
      <FAQSection />
      <BookDemoSection />
      <Footer />
    </main>
  )
}
