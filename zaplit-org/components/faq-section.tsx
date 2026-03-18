"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"

const faqs = [
  {
    question: "How do you protect our donor data?",
    answer: "Each agent runs in a sandboxed container with strict Role-Based Access Control (RBAC). They physically cannot access data outside their scope—it's not just policy, it's architecture. Development agents can draft donor emails but cannot access your CRM. Finance agents can categorize expenses but cannot move funds between restricted and unrestricted accounts.",
  },
  {
    question: "What happens if an agent makes a mistake?",
    answer: "The action is blocked and logged. Your team receives an immediate alert with full context. No data is modified, no emails are sent, and no funds are moved without proper authorization. Every blocked action is recorded in your audit trail for board reporting.",
  },
  {
    question: "Can these replace our staff?",
    answer: "No—our agents are designed to amplify your team's impact, not replace them. They handle time-consuming tasks like drafting grant proposals, scheduling volunteers, and generating impact reports so your staff can focus on relationships, strategy, and mission-critical work. Most nonprofits find their team becomes more effective and satisfied when freed from administrative burden.",
  },
  {
    question: "How is this different from other nonprofit software?",
    answer: "Traditional nonprofit software charges per-seat subscriptions that grow with your team. We charge a one-time setup fee based on your needs, then minimal maintenance. A Development Director using our Grant and Steward agents full-time costs less than half a part-time assistant—without the overhead of hiring, training, or benefits.",
  },
  {
    question: "What's included in the setup process?",
    answer: "We work closely with your team to understand your programs, donors, and workflows. We configure each agent for your specific needs, integrate with your existing tools (CRM, email, accounting), and train your staff. The 90 days ensures everything works smoothly before we step back to maintenance mode.",
  },
  {
    question: "Do we own our data?",
    answer: "Absolutely. You own everything—your data, your configurations, your integrations. We deploy to your Google Cloud account, not ours. If you ever want to stop using our agents, your data stays with you. We're just the builders; you're the owners.",
  },
  {
    question: "Are you compliant with nonprofit regulations?",
    answer: "Yes. Our agents are designed with nonprofit compliance in mind including GDPR for donor privacy, SOX-style controls for financial management, and audit trails for board transparency. We can provide documentation for your auditors and help with annual compliance reviews.",
  },
  {
    question: "Can we start small and expand?",
    answer: "Definitely. Many nonprofits start with just Development (Grant + Steward) to accelerate fundraising, then add Programs agents for volunteer management and impact reporting. You can add agents anytime as your needs grow and budget allows.",
  },
]

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section id="faq" className="py-32 border-t border-border">
      <div className="max-w-3xl mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">FAQ</p>
          <h2 className="text-4xl md:text-5xl font-serif italic mb-6 text-balance">
            Common questions
          </h2>
        </div>

        {/* FAQ Items */}
        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="border border-border rounded-xl overflow-hidden"
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-secondary/30 transition-colors"
              >
                <span className="font-medium pr-4">{faq.question}</span>
                <ChevronDown
                  className={`w-5 h-5 text-muted-foreground shrink-0 transition-transform ${
                    openIndex === index ? "rotate-180" : ""
                  }`}
                />
              </button>
              {openIndex === index && (
                <div className="px-6 pb-5">
                  <p className="text-muted-foreground leading-relaxed">{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
