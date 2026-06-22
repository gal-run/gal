import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Terminal, Shield, FileCode, Users, CheckCircle2, RefreshCw } from 'lucide-react'
import { DASHBOARD_URL } from '@/src/config'

export const metadata: Metadata = {
  title: 'Claude Code Governance & Config Sync | GAL',
  description: 'Sync CLAUDE.md and settings across your team. Standardize policies, maintain audit trails, keep Claude Code aligned.',
  alternates: {
    canonical: 'https://gal.run/integrations/claude-code',
  },
  openGraph: {
    title: 'Claude Code Governance & Config Sync | GAL',
    description: 'Sync CLAUDE.md and settings across your team. Standardize policies, maintain audit trails, keep Claude Code aligned.',
    url: 'https://gal.run/integrations/claude-code',
    type: 'website',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'GAL - Claude Code Integration',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Any',
  url: 'https://gal.run/integrations/claude-code',
  description: 'Sync CLAUDE.md and settings across your team. Standardize policies, maintain audit trails, keep Claude Code aligned.',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
}

export default function ClaudeCodeIntegrationPage() {
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
          <ProblemSection />
          <FeaturesSection />
          <HowItWorksSection />
          <TerminalDemoSection />
          <UseCasesSection />
          <ComparisonSection />
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
            <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-gray-100 rounded-full text-sm font-medium text-gray-700">
              <FileCode className="w-4 h-4" />
              Integration
            </span>
            <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-green-50 text-green-700 rounded-full text-sm font-medium">
              <CheckCircle2 className="w-4 h-4" />
              Official
            </span>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-medium tracking-tight text-black mb-6">
            Claude Code Governance & Config Sync
          </h1>
          
          <p className="text-xl text-black/60 mb-8 leading-relaxed">
            Sync CLAUDE.md, settings.json, and custom commands across your team with one command. Standardize governance policies, maintain audit trails, and keep every developer aligned with organizational standards. Built for{' '}
            <a href="https://claude.ai" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 underline">
              Claude Code
            </a>.
          </p>
          
          <div className="flex flex-wrap gap-4">
            <a
              href={`${DASHBOARD_URL}/login`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white text-sm font-medium rounded-full hover:bg-gray-800 transition-colors"
            >
              Get Started Free
              <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-gray-900 text-sm font-medium rounded-full border border-gray-200 hover:border-gray-300 transition-colors"
            >
              See How It Works
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

function ProblemSection() {
  return (
    <section className="py-20 px-8 bg-gray-50">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-6">
          The Claude Code configuration drift problem
        </h2>
        
        <p className="text-lg text-black/60 mb-10 max-w-2xl">
          When every developer configures Claude Code differently, you lose consistency, security, and visibility across your organization.
        </p>
        
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-white p-6 rounded-lg border border-gray-100">
            <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center mb-4">
              <FileCode className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-lg font-medium text-black mb-2">Inconsistent CLAUDE.md</h3>
            <p className="text-black/60">
              Every developer has different project instructions. Some have thorough CLAUDE.md files with coding standards, others have empty files or none at all. AI behaves inconsistently across your team.
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-lg border border-gray-100">
            <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center mb-4">
              <Shield className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-lg font-medium text-black mb-2">Uncontrolled Permissions</h3>
            <p className="text-black/60">
              Claude Code's settings.json controls what tools agents can use. Without governance, some developers grant dangerous permissions while others restrict legitimate workflows.
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-lg border border-gray-100">
            <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center mb-4">
              <Users className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-lg font-medium text-black mb-2">Lost Custom Commands</h3>
            <p className="text-black/60">
              Custom slash commands and specialized agents live on individual machines in .claude/commands/ and .claude/agents/. When someone leaves, institutional knowledge walks out the door with them.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function FeaturesSection() {
  const features = [
    {
      icon: RefreshCw,
      title: 'Config Sync',
      description: 'Pull approved CLAUDE.md, settings.json, custom commands, and MCP configurations with a single command. Keep every developer on the same configuration.',
    },
    {
      icon: Shield,
      title: 'Governance Policies',
      description: 'Define org-wide rules for what Claude Code can and cannot do — dangerous commands, file access, and security standards. Active blocking enforcement is on the roadmap.',
    },
    {
      icon: Terminal,
      title: 'CLI Integration',
      description: 'GAL wraps your Claude Code workflow. One command to sync, one command to verify compliance, zero friction for developers.',
    },
    {
      icon: Users,
      title: 'Team Management',
      description: 'Invite team members, manage access levels, and ensure everyone runs the same baseline configuration across all projects.',
    },
  ]
  
  return (
    <section className="py-20 px-8">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-6">
          Governance features for Claude Code
        </h2>
        
        <p className="text-lg text-black/60 mb-12 max-w-2xl">
          GAL provides the governance layer that sits between your organization and Claude Code, ensuring every session operates within approved boundaries.
        </p>
        
        <div className="grid md:grid-cols-2 gap-8">
          {features.map((feature, index) => (
            <div key={index} className="flex gap-4">
              <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <feature.icon className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-black mb-2">{feature.title}</h3>
                <p className="text-black/60">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorksSection() {
  const steps = [
    {
      step: '1',
      title: 'Connect Your Organization',
      description: 'Install the GAL GitHub App to connect your repositories. GAL auto-discovers all Claude Code configurations across your codebase.',
    },
    {
      step: '2',
      title: 'Define Approved Config',
      description: "Create your organization's approved CLAUDE.md, settings.json, custom commands, and MCP configurations in the GAL dashboard.",
    },
    {
      step: '3',
      title: 'Developers Sync',
      description: 'Team members run `gal sync --pull` to get the approved configuration. Updates are distributed instantly when policies change.',
    },
  ]
  
  return (
    <section id="how-it-works" className="py-20 px-8 bg-gray-50">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-6">
          How Claude Code config sync works
        </h2>
        
        <p className="text-lg text-black/60 mb-12 max-w-2xl">
          Get your entire team on the same Claude Code configuration in under 5 minutes.
        </p>
        
        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((item, index) => (
            <div key={index} className="relative">
              <div className="text-6xl font-bold text-gray-200 mb-4">{item.step}</div>
              <h3 className="text-xl font-medium text-black mb-3">{item.title}</h3>
              <p className="text-black/60">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function TerminalDemoSection() {
  return (
    <section className="py-20 px-8">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-6">
          One command to governance
        </h2>
        
        <p className="text-lg text-black/60 mb-8 max-w-2xl">
          Developers sync their Claude Code configuration with a single CLI command. No manual file copying, no Slack threads, no merge conflicts.
        </p>
        
        <div className="bg-gray-900 rounded-lg p-6 overflow-x-auto">
          <pre className="text-sm text-gray-300 font-mono">
{`# Install the GAL CLI
npm install -g @scheduler-systems/gal

# Authenticate with your GitHub account
gal auth login

# Pull the organization's approved Claude Code configuration
gal sync --pull

# Output:
# ✓ CLAUDE.md updated (v12 → v13)
# ✓ .claude/settings.json updated (permissions: 3 new allow rules)
# ✓ .claude/commands/ synced (2 new commands: /review, /deploy-check)
# ✓ .claude/agents/ synced (1 new agent: security-reviewer)
# ✓ .mcp.json unchanged
# 
# Sync complete. Claude Code is now on approved baseline.`}
          </pre>
        </div>
      </div>
    </section>
  )
}

function UseCasesSection() {
  const useCases = [
    {
      title: 'Security Teams',
      description: 'Define rules for what tools Claude Code can use. Prevent dangerous commands like `rm -rf` or `sudo`. Ensure every session follows security policy.',
    },
    {
      title: 'Engineering Leads',
      description: 'Distribute coding standards via CLAUDE.md. Share custom slash commands for common workflows. Onboard new developers faster with pre-configured rules.',
    },
    {
      title: 'Compliance Officers',
      description: 'Maintain audit trails of what configurations were deployed. Demonstrate governance when you are audited for SOC 2 or ISO 27001.',
    },
  ]
  
  return (
    <section className="py-20 px-8 bg-gray-50">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-12">
          Who uses GAL for Claude Code governance
        </h2>
        
        <div className="grid md:grid-cols-3 gap-8">
          {useCases.map((useCase, index) => (
            <div key={index} className="bg-white p-6 rounded-lg border border-gray-100">
              <h3 className="text-lg font-medium text-black mb-3">{useCase.title}</h3>
              <p className="text-black/60">{useCase.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ComparisonSection() {
  return (
    <section className="py-20 px-8">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-12">
          GAL vs. manual config sharing
        </h2>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="py-3 pr-4 font-semibold text-black">Capability</th>
                <th className="py-3 pr-4 font-semibold text-black">Manual (Git/Dotfiles)</th>
                <th className="py-3 pr-4 font-semibold text-green-600">GAL</th>
              </tr>
            </thead>
            <tbody className="text-black/70">
              <tr className="border-b border-gray-100">
                <td className="py-4 pr-4 font-medium text-black">Push updates to team</td>
                <td className="py-4 pr-4">No (pull only)</td>
                <td className="py-4 pr-4 text-green-600 font-medium">Yes</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-4 pr-4 font-medium text-black">Multi-repo support</td>
                <td className="py-4 pr-4">Manual symlinks</td>
                <td className="py-4 pr-4 text-green-600 font-medium">Org-wide sync</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-4 pr-4 font-medium text-black">Audit trail</td>
                <td className="py-4 pr-4">Git log only</td>
                <td className="py-4 pr-4 text-green-600 font-medium">Full visibility</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-4 pr-4 font-medium text-black">Enforcement</td>
                <td className="py-4 pr-4">None</td>
                <td className="py-4 pr-4 text-green-600 font-medium">Policy layer</td>
              </tr>
              <tr>
                <td className="py-4 pr-4 font-medium text-black">Setup time</td>
                <td className="py-4 pr-4">Hours per repo</td>
                <td className="py-4 pr-4 text-green-600 font-medium">5 minutes</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function FAQSection() {
  const faqs = [
    {
      question: 'Does GAL replace Claude Code?',
      answer: 'No. GAL is a governance layer that works WITH Claude Code. Your developers still use Claude Code normally. GAL ensures they all use the same approved configuration and policies.',
    },
    {
      question: 'What files does GAL sync for Claude Code?',
      answer: 'GAL syncs CLAUDE.md (project instructions), .claude/settings.json (tool permissions), .claude/commands/ (custom slash commands), .claude/agents/ (specialized agents), and .mcp.json (MCP server config).',
    },
    {
      question: 'How do developers update their config?',
      answer: 'Developers run `gal sync --pull` to get the latest approved configuration. You can also set up automated sync on a schedule or via CI/CD.',
    },
    {
      question: 'Can developers override the approved config?',
      answer: 'Currently, developers can override locally. Active enforcement is on the roadmap.',
    },
    {
      question: 'Does GAL work with other AI coding agents?',
      answer: 'Yes. GAL supports Claude Code, Cursor, GitHub Copilot, Windsurf, Gemini Code Assist, and Codex. You define policy once, and GAL translates it to each platform\'s configuration format.',
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
          Get your team on the same Claude Code config
        </h2>
        
        <p className="text-lg text-black/60 mb-8 max-w-xl mx-auto">
          Start with the free tier. Sync configuration across your team in under 5 minutes.
        </p>
        
        <a
          href={`${DASHBOARD_URL}/login`}
          className="inline-flex items-center gap-2 px-8 py-4 bg-gray-900 text-white text-base font-medium rounded-full hover:bg-gray-800 transition-colors"
        >
          Get Started Free
          <ArrowRight className="w-5 h-5" />
        </a>
        
        <div className="mt-12 pt-8 border-t border-gray-100">
          <h3 className="text-lg font-medium text-black mb-4">Related Features</h3>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/features/observability" className="text-green-600 hover:text-green-700 font-medium">
              AI Observability
            </Link>
            <span className="text-gray-300">|</span>
            <Link href="/features/security" className="text-green-600 hover:text-green-700 font-medium">
              AI Security
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
