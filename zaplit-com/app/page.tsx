import { Navigation } from "@/components/navigation"
import { Hero } from "@/components/hero"
import { SecuritySection } from "@/components/security-section"
import { AgentsSection } from "@/components/agents-section"
import { PlansSection } from "@/components/plans-section"
import { CalculatorSection } from "@/components/calculator-section"
import { IntegrationsSection } from "@/components/integrations-section"
import { FAQSection } from "@/components/faq-section"
import { BookDemoSection } from "@/components/book-demo-section"
import { Footer } from "@/components/footer"

export default function Home() {
  return (
    <main className="min-h-screen">
      <Navigation />
      <Hero />
      <SecuritySection />
      <AgentsSection />
      <PlansSection />
      <CalculatorSection />
      <IntegrationsSection />
      <FAQSection />
      <BookDemoSection />
      <Footer />
    </main>
  )
}
