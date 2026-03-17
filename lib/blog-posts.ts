export const posts = [
  {
    slug: "introducing-zaplit",
    title: "Introducing Zaplit: AI Agents That Can't Go Rogue",
    excerpt: "We're launching a new kind of AI automation—agent teams with built-in guardrails, isolation, and human approval workflows.",
    date: "March 15, 2026",
    category: "Announcements",
    readTime: "5 min read",
    content: `
## The Problem With AI Automation Today

Most AI automation tools hand agents a set of credentials and say "go figure it out." The agent can read your emails, write to your database, send messages on your behalf, and in some cases, execute code on your servers. There are no guardrails. No isolation. No human checkpoints.

This is dangerous. Not because AI is malicious—but because it makes mistakes. Confident, fast, plausible-sounding mistakes that can delete production records, spam your customer list, or leak sensitive data before anyone notices.

We built Zaplit because we needed a better answer.

## What Makes Zaplit Different

Every agent we deploy runs in a sandboxed isolation container. That means:

**Database Protection**: Agents get read-only access by default. They can query your data to inform decisions, but they cannot execute DROP commands, UPDATE production records, or modify schema. Any write operation requires explicit human approval.

**Communication Guards**: Agents draft emails and messages—they never send them directly. Bulk sends to more than 10 recipients always surface in the approval queue. Your agents become incredibly efficient drafters, not autonomous broadcasters.

**Instruction Firewall**: Agents cannot instruct your employees to do things outside predefined workflows. This prevents prompt injection attacks and social engineering scenarios where a malicious input tries to make your agent trick your team.

## The Human-in-the-Loop Architecture

We built an approval queue that sits at the center of everything. Before any consequential action—sending a campaign, processing a large payment, modifying a workflow—the agent creates a structured approval request with full context: what it wants to do, why, and what the expected outcome is.

You approve or reject in seconds. The agent continues or tries an alternative path.

This isn't a limitation. It's the product. Your team stays in control. Your agents handle the volume. Together, you move faster than either could alone.

## Built on Open Standards

Zaplit runs on open source infrastructure. You own the connections. There's no proprietary lock-in. If you ever want to take your workflows and run them yourself, you can.

We believe AI infrastructure should be transparent, auditable, and yours.

## What's Next

We're accepting a small number of early clients. We work with you directly to map your workflows, configure your agent team, and deploy with white-glove support. No self-serve signup. No generic plans.

If that sounds like what you've been looking for, let's talk.
    `.trim(),
  },
  {
    slug: "security-first-design",
    title: "Why Security-First Design Matters for AI Agents",
    excerpt: "Traditional automation fails when AI agents can access anything. Here's how we built isolation into every layer.",
    date: "March 12, 2026",
    category: "Security",
    readTime: "7 min read",
    content: `
## The Danger of Unconstrained Agents

When you give an AI agent full access to your systems, you're not just trusting the model—you're trusting every input it receives. A customer email. A document it summarizes. A webpage it browses. Any of these can contain instructions designed to hijack the agent's behavior.

This is called prompt injection, and it's one of the most underappreciated risks in AI automation today.

## Isolation as a Security Primitive

At Zaplit, we treat isolation not as an afterthought but as the primary design primitive. Every agent has a defined scope. It knows what systems it can touch, what actions it can take, and what requires human sign-off.

This scope is defined at deployment time and enforced at the infrastructure level—not by the model's judgment.

## Three Layers of Protection

**Layer 1: Read-Only Database Access**

Agents can query your database to understand context and retrieve relevant information. They cannot modify it. This single constraint eliminates an entire class of catastrophic failures—from accidental bulk deletes to injection-triggered data corruption.

When a write is genuinely needed, the agent prepares a structured change request. A human reviews and approves it. The operation executes. Everything is logged.

**Layer 2: Draft-Only Communications**

No agent at Zaplit has the ability to independently send an email, message, or notification. All outbound communications are created as drafts and queued for review.

For routine, low-risk messages—a follow-up email using an approved template—the approval is streamlined. For bulk sends or messages to external parties, explicit human approval is required every time.

**Layer 3: Instruction Boundaries**

Agents cannot issue instructions to humans that fall outside predefined workflows. If an agent receives input trying to make it tell your finance team to wire funds to a new account, the instruction firewall blocks it.

This makes Zaplit agents resistant to both internal mistakes and external manipulation.

## Auditability by Default

Every action every agent takes is logged with full context: timestamp, agent identity, action type, inputs, outputs, and approval status. You can audit exactly what happened and why at any point in time.

This isn't just good security practice—it's increasingly a compliance requirement for businesses using AI in customer-facing or financial workflows.

## The Bottom Line

Security in AI agents isn't about making them less capable. It's about making their capabilities trustworthy. An agent that can do 80% of the work reliably and safely is worth more than one that can theoretically do 100% but occasionally goes catastrophically wrong.

We built for reliability. We built for trust. We built for the real world.
    `.trim(),
  },
  {
    slug: "human-in-the-loop",
    title: "The Human-in-the-Loop Approach to Business Automation",
    excerpt: "AI should augment human judgment, not replace it. Our approval workflow system keeps you in control.",
    date: "March 8, 2026",
    category: "Product",
    readTime: "6 min read",
    content: `
## Why Full Automation Is the Wrong Goal

The pitch of most AI automation tools is simple: "Set it and forget it. Let the AI handle everything." It sounds appealing. It's also wrong.

Business operations involve judgment calls that context-free AI simply cannot make reliably. What looks like a routine invoice might be from a vendor you're in a dispute with. What looks like a standard customer refund might be part of a fraud pattern. What looks like a normal email send might go to someone who asked to be removed from communications six months ago.

The AI doesn't know what it doesn't know.

## The Approval Queue as a Product Feature

At Zaplit, the human-in-the-loop isn't a limitation we apologize for—it's a product feature we're proud of.

Every agent has a list of actions that require human approval. These aren't arbitrary restrictions. They're the result of careful analysis of where AI judgment is reliable and where human judgment adds irreplaceable value.

When an agent hits one of these decision points, it creates a structured approval request. Not just "I want to do X"—but full context: what the situation is, what options exist, what the agent recommends, and why.

Your team reviews this in a clean interface. Approve, reject, or ask the agent to explore an alternative. The whole thing takes thirty seconds.

## What This Unlocks

The magic of human-in-the-loop isn't control for control's sake. It's that the combination of AI speed and human judgment produces outcomes neither could achieve alone.

Your agent can process a hundred customer inquiries overnight, draft responses for each, and surface the ten that need special handling. Your team comes in the morning and handles those ten with full context—in the time it used to take to triage the whole inbox.

You're not slower. You're dramatically faster, and you haven't lost the thread on anything that matters.

## Calibrating the Loop

Not every action needs approval. Part of our deployment process is working with you to define the right thresholds.

Routine template emails: auto-approve. Campaign sends over 50 recipients: require approval. Database queries: always allowed. Database writes: always require approval. Refunds under $50: auto-approve. Refunds over $500: require approval.

These calibrations are yours to set, and they evolve as you build trust with your agent team.

## The Future of Work

We think the future of business operations isn't fully automated and it isn't fully manual. It's a tight collaboration between humans and agents where each does what they're best at.

Agents handle volume, consistency, and speed. Humans handle judgment, relationships, and edge cases. Together, small teams can operate at a scale that previously required dozens of people.

That's what we're building toward. Human-in-the-loop isn't a step on the way to full automation. It's the destination.
    `.trim(),
  },
  {
    slug: "building-with-agents",
    title: "How We Built Zaplit Using Our Own Agent Teams",
    excerpt: "We use our own Secretary, Research, and Support agents to run daily operations. Here's what we learned.",
    date: "March 5, 2026",
    category: "Engineering",
    readTime: "8 min read",
    content: `
## Eating Our Own Cooking

From day one, we've run Zaplit's internal operations using Zaplit agents. This was partly a forcing function—we needed to know our product worked before we asked clients to trust it—and partly genuinely the fastest way to get things done with a small team.

Here's what we actually use, and what we learned.

## The Secretary Agent

The Secretary agent is the orchestrator. It handles task routing, follow-up tracking, and meeting coordination. When someone on the team says "we need to follow up with the Johnson account next Tuesday," Secretary creates the task, assigns it, and surfaces it at the right time.

What surprised us: how much cognitive overhead this removes. Not having to remember to follow up, not having to track down who said what would happen—it sounds small until you've lived without that overhead for a week.

What we learned: The Secretary agent is most valuable when it has context. We invested time in building good integrations with our communication tools so it has the full picture of what's happening.

## The Research Agent

The Research agent handles competitive intelligence, market monitoring, and document analysis. When we're evaluating a potential technology partner, Research pulls together a briefing—product overview, pricing, customer reviews, recent news—in minutes.

What surprised us: the quality of synthesis. We expected to get data back and still need to analyze it ourselves. Instead, we get structured analysis with key takeaways and flags for things that need human attention.

What we learned: Research is only as good as its prompts and scope. Early on, we got reports that were technically accurate but missed what we actually wanted to know. Investing in clear briefing templates paid off immediately.

## The Support Agent

The Support agent handles first-line responses to inbound inquiries—from potential clients, from existing clients, and from general contact form submissions.

It drafts every response. Nothing goes out without a human reviewing and approving it. This isn't slowness—it's us staying in the loop on every conversation that matters while the agent handles the drafting.

What surprised us: how much tone matters. We spent more time calibrating the Support agent's communication style than any other agent. Once we got it right, responses stopped feeling like they came from a bot.

What we learned: Training the agent with examples from our best human communications, not generic templates, was the key to getting tone right.

## What Running on Your Own Product Teaches You

You find the bugs. The edge cases. The moments where the product asks too much of the user or gives too little context. Using Zaplit every day meant we shipped fixes to real friction points that might have taken months to surface through external feedback.

It also meant we were never shipping something we weren't confident in. If we weren't comfortable with our own agents doing something, we didn't ask clients to be comfortable with it either.

## The Meta-Lesson

Building a company with AI agents isn't about removing humans. It's about deploying human attention where it creates the most value. Our team focuses on product, client relationships, and strategic decisions. The agents handle coordination, research, and communications volume.

We're a small team doing work that used to take a much larger one. That's the promise of Zaplit—and it works because we built it to keep humans in control the whole way.
    `.trim(),
  },
]
