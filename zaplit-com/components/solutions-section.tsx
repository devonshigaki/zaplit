"use client"

import { useState } from "react"
import {
  Car,
  Shield,
  ShoppingBag,
  Factory,
  Truck,
  Briefcase,
  Clock,
  Users,
  TrendingUp,
  Zap,
  CheckCircle2,
  ArrowRight,
  Phone,
  Calendar,
  FileText,
  Package,
  Route,
  Receipt,
  Stethoscope,
  Home,
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"

type IndustryId = "auto" | "insurance" | "real-estate" | "healthcare" | "manufacturing" | "retail" | "logistics" | "professional"

interface Stat {
  value: string
  label: string
}

interface PainPoint {
  icon: React.ElementType
  title: string
  description: string
}

interface Solution {
  icon: React.ElementType
  title: string
  description: string
}

interface Industry {
  id: IndustryId
  name: string
  icon: React.ElementType
  headline: string
  description: string
  stats: Stat[]
  painPoints: PainPoint[]
  solutions: Solution[]
  testimonial?: {
    quote: string
    author: string
    role: string
    company: string
  }
}

const industries: Industry[] = [
  {
    id: "auto",
    name: "Automotive",
    icon: Car,
    headline: "Never Miss Another Service Call",
    description: "AI agents handle after-hours leads, schedule service appointments, and follow up with customers—so you capture every revenue opportunity.",
    stats: [
      { value: "50%", label: "Fewer missed calls" },
      { value: "75%", label: "Reduction in no-shows" },
      { value: "$500K+", label: "Annual savings" },
    ],
    painPoints: [
      { icon: Phone, title: "Missed Revenue", description: "175M missed calls cost dealerships $21B annually in lost opportunities" },
      { icon: Users, title: "High Turnover", description: "34% average turnover means constant training and inconsistency" },
      { icon: Clock, title: "After-Hours Gap", description: "Leads go cold when showrooms close—competitors respond first" },
    ],
    solutions: [
      { icon: Calendar, title: "24/7 Appointment Booking", description: "AI schedules test drives and service appointments instantly, with smart capacity management" },
      { icon: Phone, title: "Lead Qualification", description: "Captures and qualifies leads after hours, routes hot prospects to sales team" },
      { icon: FileText, title: "Service Follow-ups", description: "Automated CSI surveys and maintenance reminders keep customers engaged" },
    ],
    testimonial: {
      quote: "We captured 40% more after-hours leads in the first month. Our AI agent never sleeps, never forgets to follow up, and handles the repetitive work so our team focuses on closing.",
      author: "Michael Torres",
      role: "General Manager",
      company: "Metro Auto Group",
    },
  },
  {
    id: "insurance",
    name: "Insurance",
    icon: Shield,
    headline: "Process Claims in Seconds, Not Days",
    description: "From FNOL intake to fraud detection, AI agents accelerate claims processing while ensuring compliance and reducing costs.",
    stats: [
      { value: "80%", label: "Faster processing" },
      { value: "30%", label: "Cost reduction" },
      { value: "90%", label: "Error reduction" },
    ],
    painPoints: [
      { icon: Clock, title: "Processing Delays", description: "Auto claims take 23+ days on average—double pre-pandemic times" },
      { icon: FileText, title: "Document Overload", description: "Millions of documents daily requiring manual extraction" },
      { icon: Users, title: "Staff Burnout", description: "Associates spend 80% more time on manual data entry" },
    ],
    solutions: [
      { icon: FileText, title: "Intelligent Document Processing", description: "Extracts data from claims, police reports, and medical records automatically" },
      { icon: Shield, title: "Fraud Detection", description: "Real-time pattern analysis flags suspicious claims for review" },
      { icon: Phone, title: "FNOL Automation", description: "First Notice of Loss intake via chat or voice, 24/7" },
    ],
  },
  {
    id: "real-estate",
    name: "Real Estate",
    icon: Home,
    headline: "Respond to Leads in Under 60 Seconds",
    description: "AI agents nurture leads, coordinate showings, and manage transaction paperwork—so you close more deals without working nights and weekends.",
    stats: [
      { value: "50%", label: "More conversions" },
      { value: "24/7", label: "Lead response" },
      { value: "10x", label: "Faster follow-up" },
    ],
    painPoints: [
      { icon: Clock, title: "Slow Response", description: "Agents miss leads while showing properties—speed-to-lead is everything" },
      { icon: FileText, title: "Paperwork Paralysis", description: "Transaction coordination buries agents in documents and deadlines" },
      { icon: Users, title: "Inconsistent Follow-up", description: "Nurture sequences fall through the cracks during busy periods" },
    ],
    solutions: [
      { icon: Phone, title: "Instant Lead Response", description: "AI qualifies leads and schedules showings within seconds, 24/7" },
      { icon: Calendar, title: "Showing Coordination", description: "Automated scheduling with lockbox codes and confirmation reminders" },
      { icon: FileText, title: "Transaction Management", description: "Deadline tracking, document collection, and milestone updates" },
    ],
  },
  {
    id: "healthcare",
    name: "Healthcare",
    icon: Stethoscope,
    headline: "Reclaim 2 Hours for Every Patient Hour",
    description: "AI agents handle scheduling, insurance verification, and patient follow-ups—reducing no-shows and administrative burden.",
    stats: [
      { value: "75%", label: "Fewer no-shows" },
      { value: "70%", label: "Estimates automated" },
      { value: "$200", label: "Saved per appointment" },
    ],
    painPoints: [
      { icon: Clock, title: "Administrative Overload", description: "2 hours of paperwork for every 1 hour with patients" },
      { icon: Users, title: "No-Show Epidemic", description: "Each missed appointment costs $150-$300 in lost revenue" },
      { icon: Shield, title: "Prior Auth Bottlenecks", description: "Insurance verification delays treatments and frustrates patients" },
    ],
    solutions: [
      { icon: Calendar, title: "Smart Scheduling", description: "24/7 booking with intelligent reminders that reduce no-shows by 75%" },
      { icon: Shield, title: "Insurance Verification", description: "Automated eligibility checks and prior authorization tracking" },
      { icon: Phone, title: "Patient Follow-ups", description: "Post-visit care instructions and medication adherence reminders" },
    ],
  },
  {
    id: "manufacturing",
    name: "Manufacturing",
    icon: Factory,
    headline: "Transform Manual Processes into Real-Time Visibility",
    description: "AI agents track inventory, coordinate with suppliers, and manage quality documentation—giving you visibility into every part of production.",
    stats: [
      { value: "72%", label: "Tasks automated" },
      { value: "20%", label: "Cost reduction" },
      { value: "99%", label: "Inventory accuracy" },
    ],
    painPoints: [
      { icon: Package, title: "Manual Blind Spots", description: "72% of factory tasks still done manually with limited visibility" },
      { icon: Clock, title: "Inventory Inaccuracy", description: "Stockouts and overstocking cause delays and excess costs" },
      { icon: Truck, title: "Supplier Delays", description: "Purchase order delays and delivery miscommunications disrupt production" },
    ],
    solutions: [
      { icon: Package, title: "Inventory Intelligence", description: "Real-time WIP tracking with automated reorder triggers" },
      { icon: Phone, title: "Supplier Coordination", description: "Automated purchase orders and delivery tracking" },
      { icon: FileText, title: "Quality Documentation", description: "Automated inspection data collection and compliance reports" },
    ],
  },
  {
    id: "retail",
    name: "Retail & E-commerce",
    icon: ShoppingBag,
    headline: "Scale Customer Service Without Scaling Headcount",
    description: "AI agents handle order inquiries, process returns, and manage inventory alerts—delivering 24/7 service during peak seasons.",
    stats: [
      { value: "70%", label: "Workflows optimized" },
      { value: "87%", label: "Faster returns" },
      { value: "45%", label: "Speed improvement" },
    ],
    painPoints: [
      { icon: Package, title: "Manual Order Processing", description: "70% of retailers cite manual workflows as major barrier" },
      { icon: Users, title: "Service Overwhelm", description: "Peak seasons crush customer service teams" },
      { icon: Clock, title: "Returns Complexity", description: "Reverse logistics consumes significant resources" },
    ],
    solutions: [
      { icon: Phone, title: "Order Support", description: "'Where's my order?' inquiries handled automatically, 24/7" },
      { icon: Package, title: "Returns Automation", description: "RMA generation, label creation, and refund processing" },
      { icon: TrendingUp, title: "Inventory Alerts", description: "Low-stock notifications and automatic reorder suggestions" },
    ],
  },
  {
    id: "logistics",
    name: "Logistics",
    icon: Truck,
    headline: "Eliminate 'Where's My Shipment?' Calls Forever",
    description: "AI agents optimize routes, provide shipment updates, and coordinate with drivers—reducing costs and improving customer satisfaction.",
    stats: [
      { value: "28%", label: "Cost reduction" },
      { value: "24%", label: "Fewer empty miles" },
      { value: "73%", label: "Less tracking time" },
    ],
    painPoints: [
      { icon: Phone, title: "Tracking Inquiries", description: "40% of customer service time consumed by 'where's my shipment?' calls" },
      { icon: Route, title: "Route Inefficiency", description: "Static routing can't adapt to traffic or last-minute changes" },
      { icon: Clock, title: "Limited Visibility", description: "54% of businesses lack real-time supply chain visibility" },
    ],
    solutions: [
      { icon: Route, title: "Dynamic Routing", description: "Real-time optimization based on traffic, capacity, and delivery windows" },
      { icon: Phone, title: "Proactive Updates", description: "Automated ETA notifications and delay alerts to customers" },
      { icon: Truck, title: "Driver Coordination", description: "Automated dispatch instructions and hands-free check-ins" },
    ],
  },
  {
    id: "professional",
    name: "Professional Services",
    icon: Briefcase,
    headline: "Focus on Billable Work, Not Busy Work",
    description: "AI agents handle client intake, document management, and scheduling—so your team spends time on high-value work, not administration.",
    stats: [
      { value: "72%", label: "Faster documents" },
      { value: "$50K", label: "Monthly savings" },
      { value: "10+", label: "Extra clients/mo" },
    ],
    painPoints: [
      { icon: FileText, title: "Document Chaos", description: "Version control issues and time-consuming document assembly" },
      { icon: Clock, title: "Billing Leakage", description: "Time tracking leaks and delayed invoicing cost revenue" },
      { icon: Users, title: "After-Hours Loss", description: "Potential clients contact when firms are closed" },
    ],
    solutions: [
      { icon: Users, title: "Client Onboarding", description: "Automated intake forms, conflict checking, and engagement letters" },
      { icon: FileText, title: "Document Assembly", description: "Template-based document creation with version control" },
      { icon: Receipt, title: "Time & Billing", description: "Automated time capture and invoice generation" },
    ],
  },
]

function IndustryCard({ industry }: { industry: Industry }) {
  return (
    <div className="space-y-8">
      {/* Hero Stats */}
      <div className="grid grid-cols-3 gap-4">
        {industry.stats.map((stat, i) => (
          <div
            key={i}
            className="bg-card border border-border rounded-xl p-4 text-center"
          >
            <p className="text-2xl md:text-3xl font-mono font-medium text-foreground mb-1">
              {stat.value}
            </p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Pain Points - Large Card */}
        <div className="md:col-span-2 bg-card border border-border rounded-xl p-6">
          <h4 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
            <TrendingUp className="w-3 h-3 rotate-180" />
            Challenges We Solve
          </h4>
          <div className="space-y-4">
            {industry.painPoints.map((pain, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-secondary/50 border border-border flex items-center justify-center shrink-0">
                  <pain.icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-sm">{pain.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {pain.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Solutions - Stacked Cards */}
        <div className="space-y-4">
          {industry.solutions.map((solution, i) => (
            <div
              key={i}
              className="bg-card border border-border rounded-xl p-4 hover:border-muted-foreground/50 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-secondary/50 border border-border flex items-center justify-center shrink-0">
                  <solution.icon className="w-4 h-4 text-foreground" />
                </div>
                <div>
                  <p className="font-medium text-sm">{solution.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                    {solution.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Testimonial */}
      {industry.testimonial && (
        <div className="bg-secondary/30 border border-border rounded-xl p-6">
          <div className="flex items-start gap-1 mb-4">
            {[...Array(5)].map((_, i) => (
              <Zap key={i} className="w-4 h-4 fill-primary text-primary" />
            ))}
          </div>
          <blockquote className="text-muted-foreground italic mb-4 leading-relaxed">
            "{industry.testimonial.quote}"
          </blockquote>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-secondary border border-border flex items-center justify-center">
              <span className="text-sm font-medium">
                {industry.testimonial.author.split(" ").map((n) => n[0]).join("")}
              </span>
            </div>
            <div>
              <p className="font-medium text-sm">{industry.testimonial.author}</p>
              <p className="text-xs text-muted-foreground">
                {industry.testimonial.role}, {industry.testimonial.company}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-card border border-border rounded-xl p-6">
        <div>
          <p className="font-medium">Ready to transform your {industry.name.toLowerCase()} operations?</p>
          <p className="text-sm text-muted-foreground">Book a demo customized for your industry</p>
        </div>
        <Button className="group shrink-0" asChild>
          <a href="#book-demo">
            Book Industry Demo
            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </a>
        </Button>
      </div>
    </div>
  )
}

export function SolutionsSection() {
  const [activeIndustry, setActiveIndustry] = useState<IndustryId>("auto")

  return (
    <section id="solutions" className="py-32 border-t border-border">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <div className="max-w-2xl mb-16">
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">
            Industry Solutions
          </p>
          <h2 className="text-4xl md:text-5xl font-serif italic mb-6 text-balance">
            Built for your industry, ready for your challenges
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Pre-trained AI agents that understand the unique workflows, terminology, and compliance requirements of your industry. Deploy in days, not months.
          </p>
        </div>

        {/* Industry Tabs */}
        <Tabs
          value={activeIndustry}
          onValueChange={(value) => setActiveIndustry(value as IndustryId)}
          className="space-y-8"
        >
          {/* Tab List - Scrollable on mobile */}
          <div className="overflow-x-auto -mx-6 px-6 pb-2">
            <TabsList className="inline-flex w-auto min-w-full bg-secondary/50 p-1 rounded-xl h-auto flex-wrap gap-1">
              {industries.map((industry) => (
                <TabsTrigger
                  key={industry.id}
                  value={industry.id}
                  className="data-[state=active]:bg-foreground data-[state=active]:text-background px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap"
                >
                  <industry.icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{industry.name}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Tab Content */}
          {industries.map((industry) => (
            <TabsContent
              key={industry.id}
              value={industry.id}
              className="space-y-8 outline-none"
            >
              {/* Industry Header */}
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-xl bg-foreground text-background flex items-center justify-center shrink-0">
                  <industry.icon className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-2xl md:text-3xl font-serif italic mb-2">
                    {industry.headline}
                  </h3>
                  <p className="text-muted-foreground max-w-2xl">
                    {industry.description}
                  </p>
                </div>
              </div>

              <IndustryCard industry={industry} />
            </TabsContent>
          ))}
        </Tabs>

        {/* Universal Benefits */}
        <div className="mt-24 pt-16 border-t border-border">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">
              Universal Benefits
            </p>
            <h3 className="text-3xl md:text-4xl font-serif italic mb-4">
              Why every industry chooses Zaplit
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: Clock,
                title: "24/7 Operation",
                description: "Never miss a lead or customer inquiry—even after hours, weekends, and holidays",
              },
              {
                icon: CheckCircle2,
                title: "Consistent Execution",
                description: "Every task follows your exact procedures. No missed steps, no shortcuts.",
              },
              {
                icon: TrendingUp,
                title: "Instant Scale",
                description: "Handle 10x volume during peak seasons without hiring or training",
              },
              {
                icon: Shield,
                title: "Built-in Compliance",
                description: "SOC2 ready, GDPR compliant, with audit trails for every action",
              },
            ].map((benefit, i) => (
              <div
                key={i}
                className="bg-card border border-border rounded-xl p-6 hover:border-muted-foreground/30 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-secondary/50 border border-border flex items-center justify-center mb-4">
                  <benefit.icon className="w-5 h-5 text-foreground" />
                </div>
                <h4 className="font-medium mb-2">{benefit.title}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {benefit.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="mt-16 text-center">
          <p className="text-muted-foreground mb-6">
            Don't see your industry? Our agents adapt to any workflow.
          </p>
          <Button size="lg" variant="outline" asChild>
            <a href="#book-demo">Schedule a Custom Demo</a>
          </Button>
        </div>
      </div>
    </section>
  )
}
