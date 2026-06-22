import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Eye, GitBranch, Terminal, FileText, Globe, Shield, Activity, Search, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { DASHBOARD_URL } from '@/src/config'

export const metadata: Metadata = {
  title: 'Generative AI Observability | GAL',
  description: 'Track AI agent operations in real-time. Git commits, shell commands, file changes, API calls.',
  alternates: {
    canonical: 'https://gal.run/features/observability',
  },
  openGraph: {
    title: 'Generative AI Observability | GAL',
    description: 'Track AI agent operations in real-time. Git commits, shell commands, file changes, API calls.',
    url: 'https://gal.run/features/observability',
    type: 'website',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'GAL - AI Agent Observability',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Any',
  url: 'https://gal.run/features/observability',
  description: 'Track AI agent operations in real-time. Git commits, shell commands, file changes, API calls.',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
}

export default function ObservabilityFeaturePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="min-h-screen bg-white">
        <Header />
        
        <main>
          <HeroSection />
          <WhatWeTrackSection />
          <DashboardPreviewSection />
          <UseCasesSection />
          <BenefitsSection />
          <ComparisonSection />
          <HowItWorksSection />
          <FAQSection />
          <CTASection />
        </main>
        
        <Footer />
      </div>
    </>
  )
}

function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
      <nav className="max-w-[1376px] mx-auto px-8 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <svg viewBox="0 0 36 36" className="w-10 h-10" fill="none">
            <rect width="36" height="36" rx="8" fill="black" />
            <path d="M8 12L18 6L28 12V18L18 12L8 18V12Z" fill="#00FF2A" />
            <path d="M8 18L18 12L28 18V24L18 18L8 24V18Z" fill="#00FF2A" fillOpacity="0.6" />
            <path d="M8 24L18 18L28 24V30L18 24L8 30V24Z" fill="#00FF2A" fillOpacity="0.3" />
          </svg>
          <span className="text-4xl font-black tracking-tight text-gray-900">
            gal<span className="text-[#00FF2A]">.</span>run
          </span>
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/" className="text-sm font-medium text-black/44 hover:text-black transition-colors hidden sm:block">
            HOME
          </Link>
          <Link href="/blog" className="text-sm font-medium text-black/44 hover:text-black transition-colors hidden sm:block">
            BLOG
          </Link>
          <a
            href={`${DASHBOARD_URL}/login`}
            className="hidden sm:flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-full hover:bg-gray-800 transition-colors"
          >
            GET STARTED
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </nav>
    </header>
  )
}

function HeroSection() {
  return (
    <section className="pt-32 pb-20 px-8">
      <div className="max-w-[1376px] mx-auto">
        <div className="max-w-3xl">
          <div className="flex items-center gap-3 mb-6">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-green-50 text-green-700 rounded-full text-sm font-medium">
              <Eye className="w-4 h-4" />
              Feature
            </span>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-medium tracking-tight text-black mb-6">
            Generative AI Observability
          </h1>
          
        <p className="text-xl text-black/60 mb-8 leading-relaxed">
          Complete visibility into AI agent operations. Track git commits, shell commands, file changes, and API calls in real-time. Audit trails for compliance and security that map to common frameworks as we build toward them.
        </p>
          
          <div className="flex flex-wrap gap-4">
            <a
              href={`${DASHBOARD_URL}/login`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white text-sm font-medium rounded-full hover:bg-gray-800 transition-colors"
            >
              Start Free Trial
              <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href="#what-we-track"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-gray-900 text-sm font-medium rounded-full border border-gray-200 hover:border-gray-300 transition-colors"
            >
              See What We Track
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

function WhatWeTrackSection() {
  const trackItems = [
    {
      icon: GitBranch,
      title: 'Git Operations',
      description: 'Every git commit, push, pull, branch, and merge. See exactly what code changes agents made, when, and in what context.',
      examples: ['git commit', 'git push origin main', 'git checkout -b feature'],
    },
    {
      icon: Terminal,
      title: 'Shell Commands',
      description: 'All terminal commands executed by agents. Know exactly what scripts ran, what packages were installed, what files were modified.',
      examples: ['npm install', 'docker build', 'rm -rf dist'],
    },
    {
      icon: FileText,
      title: 'File Modifications',
      description: 'Read, write, and edit operations on your codebase. Track which files agents accessed and changed.',
      examples: ['Read: src/auth.ts', 'Write: .env', 'Edit: package.json'],
    },
    {
      icon: Globe,
      title: 'API Calls',
      description: 'External network requests made by agents. Monitor which services agents communicate with and what data flows out.',
      examples: ['POST api.stripe.com', 'GET github.com/repos', 'PUT s3.amazonaws.com'],
    },
  ]
  
  return (
    <section id="what-we-track" className="py-20 px-8 bg-gray-50">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-6">
          What GAL observes in AI agent sessions
        </h2>
        
        <p className="text-lg text-black/60 mb-12 max-w-2xl">
          AI agents operate at machine speed. GAL captures every operation so you can understand what happened, when, and why.
        </p>
        
        <div className="grid md:grid-cols-2 gap-8">
          {trackItems.map((item, index) => (
            <div key={index} className="bg-white p-6 rounded-lg border border-gray-100">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
                  <item.icon className="w-6 h-6 text-green-600" />
                </div>
                <h3 className="text-lg font-medium text-black">{item.title}</h3>
              </div>
              <p className="text-black/60 mb-4">{item.description}</p>
              <div className="flex flex-wrap gap-2">
                {item.examples.map((example, i) => (
                  <code key={i} className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-700">
                    {example}
                  </code>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function DashboardPreviewSection() {
  return (
    <section className="py-20 px-8">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-6">
          Real-time operation feed
        </h2>
        
        <p className="text-lg text-black/60 mb-8 max-w-2xl">
          Watch AI agent operations as they happen. Filter by type, search by keyword, and drill into any operation for full context.
        </p>
        
        <div className="bg-gray-900 rounded-lg p-6 overflow-x-auto">
          <div className="text-sm text-gray-400 mb-4 font-mono">Live Operation Feed</div>
          <div className="space-y-3">
            <OperationRow 
              time="10:42:31.204"
              type="git"
              operation='git commit -m "Add auth middleware"'
              agent="claude-code"
              status="success"
            />
            <OperationRow 
              time="10:42:29.891"
              type="file"
              operation="Write: src/middleware/auth.ts"
              agent="claude-code"
              status="success"
            />
            <OperationRow 
              time="10:42:27.455"
              type="shell"
              operation="npm run lint"
              agent="claude-code"
              status="success"
            />
            <OperationRow 
              time="10:42:25.102"
              type="api"
              operation="GET api.github.com/user/repos"
              agent="claude-code"
              status="success"
            />
            <OperationRow 
              time="10:42:22.087"
              type="git"
              operation="git push --force origin main"
              agent="claude-code"
              status="blocked"
              note="Policy violation: force push to main"
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function OperationRow({ time, type, operation, agent, status, note }: {
  time: string
  type: string
  operation: string
  agent: string
  status: 'success' | 'blocked' | 'sandboxed'
  note?: string
}) {
  const statusColors = {
    success: 'text-green-400',
    blocked: 'text-red-400',
    sandboxed: 'text-yellow-400',
  }
  
  const typeIcons: Record<string, string> = {
    git: '⎇',
    file: '📄',
    shell: '⌘',
    api: '🌐',
  }
  
  return (
    <div className="flex items-center gap-4 text-sm font-mono">
      <span className="text-gray-500 w-24">{time}</span>
      <span className="text-gray-400 w-6">{typeIcons[type]}</span>
      <code className="flex-1 text-gray-300 truncate">{operation}</code>
      <span className="text-gray-500 w-24">{agent}</span>
      <span className={`w-20 ${statusColors[status]}`}>
        {status === 'success' && '✓'}
        {status === 'blocked' && '✕'}
        {status === 'sandboxed' && '⚠'}
        {status}
      </span>
    </div>
  )
}

function UseCasesSection() {
  const useCases = [
    {
      icon: Shield,
      title: 'Security Investigation',
      description: 'When something goes wrong, trace exactly what the agent did. See the full command history, file accesses, and external calls that led to the incident.',
    },
    {
      icon: CheckCircle2,
      title: 'Compliance Audits',
      description: 'Generate audit reports showing every operation during a given period. Demonstrate to SOC 2, ISO 27001, or HIPAA auditors that AI agents operated within approved boundaries.',
    },
    {
      icon: Search,
      title: 'Debugging Agent Behavior',
      description: 'Agents sometimes make unexpected decisions. The operation log shows exactly what commands they ran and what files they accessed, helping you understand why.',
    },
    {
      icon: Activity,
      title: 'Performance Monitoring',
      description: 'Track how many operations agents perform per session. Identify patterns, optimize workflows, and measure the impact of policy changes.',
    },
  ]
  
  return (
    <section className="py-20 px-8 bg-gray-50">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-6">
          Why generative AI observability matters
        </h2>
        
        <p className="text-lg text-black/60 mb-12 max-w-2xl">
          Without visibility, AI agents are a black box. GAL illuminates every operation so you can govern with confidence.
        </p>
        
        <div className="grid md:grid-cols-2 gap-8">
          {useCases.map((useCase, index) => (
            <div key={index} className="flex gap-4">
              <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <useCase.icon className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-black mb-2">{useCase.title}</h3>
                <p className="text-black/60">{useCase.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function BenefitsSection() {
  return (
    <section className="py-20 px-8">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-12">
          Key benefits of AI agent observability
        </h2>
        
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-gray-50 p-6 rounded-lg">
            <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center mb-4">
              <Clock className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-lg font-medium text-black mb-2">Real-Time Visibility</h3>
            <p className="text-black/60">
              Watch operations as they happen, not after the fact. Respond to issues immediately instead of discovering them in post-mortems.
            </p>
          </div>
          
          <div className="bg-gray-50 p-6 rounded-lg">
            <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center mb-4">
              <Search className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-lg font-medium text-black mb-2">Searchable History</h3>
            <p className="text-black/60">
              Every operation is logged and searchable. Find specific commands, filter by time range, or search across all your AI agent sessions.
            </p>
          </div>
          
          <div className="bg-gray-50 p-6 rounded-lg">
            <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-lg font-medium text-black mb-2">Anomaly Detection</h3>
            <p className="text-black/60">
              Flag unusual patterns automatically. Get alerted when agents perform operations outside normal behavior for your organization.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function ComparisonSection() {
  return (
    <section className="py-20 px-8 bg-gray-50">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-12">
          GAL vs. traditional monitoring tools
        </h2>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="py-3 pr-4 font-semibold text-black">Capability</th>
                <th className="py-3 pr-4 font-semibold text-black">Traditional Tools</th>
                <th className="py-3 pr-4 font-semibold text-green-600">GAL</th>
              </tr>
            </thead>
            <tbody className="text-black/70">
              <tr className="border-b border-gray-100">
                <td className="py-4 pr-4 font-medium text-black">Agent-specific context</td>
                <td className="py-4 pr-4">No</td>
                <td className="py-4 pr-4 text-green-600 font-medium">Yes</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-4 pr-4 font-medium text-black">Operation-level granularity</td>
                <td className="py-4 pr-4">Process-level</td>
                <td className="py-4 pr-4 text-green-600 font-medium">Command-level</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-4 pr-4 font-medium text-black">Intent classification</td>
                <td className="py-4 pr-4">No</td>
                <td className="py-4 pr-4 text-green-600 font-medium">Yes</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-4 pr-4 font-medium text-black">Multi-agent support</td>
                <td className="py-4 pr-4">Varies</td>
                <td className="py-4 pr-4 text-green-600 font-medium">6 platforms</td>
              </tr>
              <tr>
                <td className="py-4 pr-4 font-medium text-black">Compliance-ready export</td>
                <td className="py-4 pr-4">Manual</td>
                <td className="py-4 pr-4 text-green-600 font-medium">One-click</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function HowItWorksSection() {
  return (
    <section className="py-20 px-8">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-6">
          How AI agent observability works
        </h2>
        
        <p className="text-lg text-black/60 mb-12 max-w-2xl">
          GAL intercepts operations at the runtime level, capturing everything before it executes.
        </p>
        
        <div className="grid md:grid-cols-3 gap-8">
          <div className="relative">
            <div className="text-6xl font-bold text-gray-200 mb-4">1</div>
            <h3 className="text-xl font-medium text-black mb-3">Intercept</h3>
            <p className="text-black/60">
              GAL wraps your AI agent\'s execution environment. Every operation passes through the GAL layer before executing.
            </p>
          </div>
          
          <div className="relative">
            <div className="text-6xl font-bold text-gray-200 mb-4">2</div>
            <h3 className="text-xl font-medium text-black mb-3">Log</h3>
            <p className="text-black/60">
              Operations are logged with full context: timestamp, agent, operation type, parameters, and result. All stored securely in your GAL workspace.
            </p>
          </div>
          
          <div className="relative">
            <div className="text-6xl font-bold text-gray-200 mb-4">3</div>
            <h3 className="text-xl font-medium text-black mb-3">Analyze</h3>
            <p className="text-black/60">
              View operations in real-time or search historical data. Export for compliance, investigate incidents, or optimize agent workflows.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function FAQSection() {
  const faqs = [
    {
      question: 'What is generative AI observability?',
      answer: 'Generative AI observability is the ability to see and understand what AI agents are doing in real-time. It goes beyond traditional monitoring by capturing agent-specific operations like file reads, shell commands, git operations, and API calls with full context.',
    },
    {
      question: 'Why do I need observability for AI coding agents?',
      answer: 'AI agents operate autonomously at machine speed. Without observability, you have no visibility into what they did, when, or why. This creates security blind spots, makes debugging difficult, and prevents meaningful governance.',
    },
    {
      question: 'Does observability slow down my agents?',
      answer: 'No. GAL adds less than 5ms of latency to each operation. The overhead is negligible for interactive use and imperceptible for automated workflows.',
    },
    {
      question: 'How long is operation history retained?',
      answer: 'Retention depends on your tier. Free tier keeps 7 days of history. Paid tiers offer 90 days to unlimited retention for compliance requirements.',
    },
    {
      question: 'Can I export operation logs for compliance audits?',
      answer: 'Yes. GAL supports one-click export of operation logs in CSV and JSON formats. Generate reports filtered by date range, agent, operation type, or user to support SOC 2, ISO 27001, and HIPAA audits.',
    },
  ]
  
  return (
    <section className="py-20 px-8 bg-gray-50">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-12">
          Frequently asked questions
        </h2>
        
        <div className="max-w-3xl space-y-8">
          {faqs.map((faq, index) => (
            <div key={index}>
              <h3 className="text-lg font-medium text-black mb-2">{faq.question}</h3>
              <p className="text-black/60">{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function CTASection() {
  return (
    <section className="py-20 px-8">
      <div className="max-w-[1376px] mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-6">
          See what your AI agents are doing
        </h2>
        
        <p className="text-lg text-black/60 mb-8 max-w-xl mx-auto">
          Get complete visibility into AI agent operations in under 5 minutes. Free tier available.
        </p>
        
        <div className="flex flex-wrap justify-center gap-4">
          <a
            href={`${DASHBOARD_URL}/login`}
            className="inline-flex items-center gap-2 px-8 py-4 bg-gray-900 text-white text-base font-medium rounded-full hover:bg-gray-800 transition-colors"
          >
            Start Free Trial
            <ArrowRight className="w-5 h-5" />
          </a>
          <Link
            href="/integrations/claude-code"
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-gray-900 text-base font-medium rounded-full border border-gray-200 hover:border-gray-300 transition-colors"
          >
            Claude Code Integration
          </Link>
        </div>
        
        <div className="mt-12 pt-8 border-t border-gray-100">
          <h3 className="text-lg font-medium text-black mb-4">Related Features</h3>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/compliance" className="text-green-600 hover:text-green-700 font-medium">
              AI Compliance
            </Link>
            <span className="text-gray-300">|</span>
            <Link href="/governance" className="text-green-600 hover:text-green-700 font-medium">
              AI Governance
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-gray-100 py-8">
      <div className="max-w-[1376px] mx-auto px-8 flex items-center justify-between">
        <span className="text-sm text-black/44">
          &copy; {new Date().getFullYear()} Scheduler Systems Ltd.
        </span>
        <Link href="/" className="text-sm text-black/44 hover:text-black transition-colors">
          gal.run
        </Link>
      </div>
    </footer>
  )
}
