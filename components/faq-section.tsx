"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"

const faqs = [
  {
    question: "How does agent isolation prevent accidents?",
    answer: "Each agent runs in a sandboxed container with strict Role-Based Access Control (RBAC). They physically cannot execute commands outside their scope—it's not just policy, it's architecture. Database agents have read-only access, communication agents can only draft (not send), and all high-impact actions require human approval.",
  },
  {
    question: "What happens if an agent tries to exceed its boundaries?",
    answer: "The action is immediately blocked and logged in the Isolation Log. You'll see a real-time notification with details about what was attempted and why it was denied. This creates a complete audit trail and helps identify if agents need scope adjustments or if there are workflow improvements needed.",
  },
  {
    question: "Can agents instruct employees to do harmful things?",
    answer: "No. Our Instruction Firewall prevents agents from delegating tasks to human employees outside predefined workflows. Agents cannot send requests that bypass approval chains, ask for credentials, or request actions that would circumvent security controls. This protects against social engineering attempts.",
  },
  {
    question: "How does pricing work compared to traditional software?",
    answer: "We're not a subscription. You pay a one-time build cost for each agent ($8k-$18k depending on complexity), plus optional annual maintenance ($1,200-$3,000 per agent). Compare this to hiring: a single marketing employee costs $85k/year. Our Marketing agent costs $14k to build and $2,400/year to maintain—that's an 83% savings in year one alone.",
  },
  {
    question: "What's included in the 90-day handoff period?",
    answer: "Full deployment on your infrastructure, integration with your existing tools, custom workflow configuration, team training, documentation, and direct support. We don't just hand over code—we ensure your team is confident operating the system before we step back.",
  },
  {
    question: "Do I own the infrastructure?",
    answer: "Yes, 100%. Everything is built on n8n, an open-source workflow automation platform. Your agents, workflows, and integrations run on infrastructure you control. No proprietary lock-in, no data leaving your systems, no dependency on our continued existence.",
  },
  {
    question: "What compliance standards do you support?",
    answer: "Our agents are designed to be SOC2, GDPR, HIPAA, and PCI-DSS compliant out of the box. During the tech stack assessment, we identify your specific requirements and configure isolation scopes and audit logging accordingly. The Security agent specifically monitors compliance and maintains audit trails.",
  },
  {
    question: "Can I start with one department and add more later?",
    answer: "Absolutely. Many clients start with Operations (the Secretary orchestrator) or Service (Lead, Billing, Support) and expand from there. Each department is modular. The Secretary agent is designed to coordinate across whatever departments you have, so scaling up is seamless.",
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
