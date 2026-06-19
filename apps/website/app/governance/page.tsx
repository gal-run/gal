import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Shield, Eye, Lock, FileCheck, Users, CheckCircle2, AlertTriangle, Scale, Clock, Zap, Terminal, Globe, RefreshCw } from 'lucide-react'
import { DASHBOARD_URL, PRICING_TIERS } from '@/src/config'

export const metadata: Metadata = {
  title: 'AI Governance Solution | GAL',
  description: 'GAL is the governance layer for AI coding agents. Config discovery, policy enforcement, audit trails.',
  alternates: {
    canonical: 'https://gal.run/governance',
  },
  openGraph: {
    title: 'AI Governance Solution | GAL',
    description: 'GAL is the governance layer for AI coding agents. Config discovery, policy enforcement, audit trails.',
    url: 'https://gal.run/governance',
    type: 'website',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'GAL - AI Governance Solution',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Any',
  url: 'https://gal.run/governance',
  description: 'GAL is the governance layer for AI coding agents. Config discovery, policy enforcement, audit trails.',
  offers: {
    '@type': 'Offer',
    price: '10',
    priceCurrency: 'USD',
  },
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.9',
    ratingCount: '127',
  },
}

export default function AIGovernancePage() {
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
          <SolutionSection />
          <ThreePillarsSection />
          <PlatformsSection />
          <FeaturesSection />
          <AIAgentManagementSection />
          <PricingSection />
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
              <Shield className="w-4 h-4" />
              Governance
            </span>
            <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-green-50 text-green-700 rounded-full text-sm font-medium">
              <CheckCircle2 className="w-4 h-4" />
              Enterprise Ready
            </span>
          </div>
          <h1 className="text-5xl md:text-6xl font-medium tracking-tight text-black mb-6">
            AI Governance Solution for Coding Agents
          </h1>
          <p className="text-xl text-black/60 mb-8 leading-relaxed">
            GAL is the governance layer for AI coding agents. Config discovery, policy enforcement, audit trails. Govern Claude Code, Cursor, Copilot from one dashboard.
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
              href="#features"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-gray-900 text-sm font-medium rounded-full border border-gray-200 hover:border-gray-300 transition-colors"
            >
              Explore Features
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
          Ungoverned AI agents create risk
        </h2>
        <p className="text-lg text-black/60 mb-10 max-w-2xl">
          AI coding agents operate with broad permissions. Without governance, every session is a potential security incident waiting to happen.
        </p>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-white p-6 rounded-lg border border-gray-100">
            <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-lg font-medium text-black mb-2">Shadow AI Operations</h3>
            <p className="text-black/60">
              Developers grant permissions that security never approved. Agents access sensitive files, execute dangerous commands, and exfiltrate data without oversight.
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg border border-gray-100">
            <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center mb-4">
              <Users className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-lg font-medium text-black mb-2">Configuration Chaos</h3>
            <p className="text-black/60">
              Every developer configures their AI agent differently. No consistency, no standards, no visibility into what agents are actually doing across your organization.
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg border border-gray-100">
            <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center mb-4">
              <Scale className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-lg font-medium text-black mb-2">Compliance Blind Spots</h3>
            <p className="text-black/60">
              Auditors ask what your AI agents can access. You have no answer. No audit trail, no policy documentation, no way to demonstrate control.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function SolutionSection() {
  return (
    <section className="py-20 px-8">
      <div className="max-w-[1376px] mx-auto">
        <div className="max-w-3xl">
          <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-6">
            GAL is the governance layer for AI coding agents
          </h2>
          <p className="text-lg text-black/60 mb-10 leading-relaxed">
            GAL sits between your organization and your AI coding agents. Define policy once, enforce everywhere, and maintain complete visibility into agent operations across Claude Code, Cursor, Copilot, and more.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-8">
          <div className="flex gap-4">
            <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <Shield className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-black mb-2">Centralized Control</h3>
              <p className="text-black/60">
                Define your organization&apos;s approved AI agent configurations in one place. Policies flow to every developer, every project, every agent.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <Eye className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-black mb-2">Complete Visibility</h3>
              <p className="text-black/60">
                See every agent session, every config change, every policy enforcement action. Full audit trails for compliance and security reviews.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <Lock className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-black mb-2">Policy Enforcement</h3>
              <p className="text-black/60">
                Block dangerous operations before they happen. Enforce guardrails on file access, shell commands, and network operations at the CLI level.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <FileCheck className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-black mb-2">Compliance Ready</h3>
              <p className="text-black/60">
                SOC 2, ISO 27001, and enterprise security requirements. Generate reports, demonstrate control, pass audits with documentation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function ThreePillarsSection() {
  const pillars = [
    {
      icon: Eye,
      title: 'Visibility',
      subtitle: 'See everything',
      description: 'Auto-discover all AI agent configurations across your repositories. Know what agents exist, what they can do, and who configured them.',
      features: [
        'Auto-discovery of CLAUDE.md, .cursorrules, copilot instructions',
        'Dashboard view of all agent configs by repo',
        'Change tracking and version history',
        'Session activity monitoring',
      ],
      link: '/features/observability',
    },
    {
      icon: Lock,
      title: 'Control',
      subtitle: 'Define boundaries',
      description: 'Set organization-wide policies for what AI agents can and cannot do. Enforce rules consistently across all platforms.',
      features: [
        'Policy-as-code for agent permissions',
        'Command and file access restrictions',
        'Multi-platform policy translation',
        'Active blocking (coming soon)',
      ],
      link: '/features/security',
    },
    {
      icon: FileCheck,
      title: 'Compliance',
      subtitle: 'Prove governance',
      description: 'Maintain audit trails, generate compliance reports, and demonstrate control to auditors and stakeholders. Aligned with the NIST AI Risk Management Framework.',
      features: [
        'Complete audit logging',
        'Compliance dashboard and reports',
        'Policy version history',
        'SOC 2 and ISO 27001 ready',
      ],
      link: '/compliance',
      externalLink: 'https://www.nist.gov/itl/ai-risk-management-framework',
    },
  ]

  return (
    <section id="features" className="py-20 px-8 bg-gray-50">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-6">
          Three pillars of AI agent governance
        </h2>
        <p className="text-lg text-black/60 mb-12 max-w-2xl">
          GAL provides comprehensive governance through visibility, control, and compliance.
        </p>
        <div className="grid md:grid-cols-3 gap-8">
          {pillars.map((pillar, index) => (
            <div key={index} className="bg-white p-6 rounded-lg border border-gray-100">
              <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center mb-4">
                <pillar.icon className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-xl font-medium text-black mb-1">{pillar.title}</h3>
              <p className="text-sm text-green-600 font-medium mb-3">{pillar.subtitle}</p>
              <p className="text-black/60 mb-4">{pillar.description}</p>
              <ul className="space-y-2 mb-6">
                {pillar.features.map((feature, fIndex) => (
                  <li key={fIndex} className="flex items-start gap-2 text-sm text-black/70">
                    <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-3">
                <Link href={pillar.link} className="text-sm font-medium text-green-600 hover:text-green-700 transition-colors inline-flex items-center gap-1">
                  Learn more <ArrowRight className="w-4 h-4" />
                </Link>
                {pillar.externalLink && (
                  <a href={pillar.externalLink} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors">
                    NIST AI RMF ↗
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function PlatformsSection() {
  const platforms = [
    { name: 'Claude Code', description: 'Govern CLAUDE.md, settings.json, custom commands, and agent definitions.', link: '/integrations/claude-code' },
    { name: 'Cursor', description: 'Control .cursorrules, .cursor/settings, and Cursor-specific permissions.', link: '/integrations/cursor' },
    { name: 'GitHub Copilot', description: 'Manage Copilot instructions, suggestions, and repository settings.', link: '/integrations/copilot' },
    { name: 'Gemini Code Assist', description: 'Control Gemini agent settings and instruction files.', link: '/integrations/gemini' },
    { name: 'Codex', description: 'Manage Codex configurations and agent behaviors.', link: '/integrations/codex' },
  ]

  return (
    <section className="py-20 px-8">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-6">
          Govern all major AI coding agents
        </h2>
        <p className="text-lg text-black/60 mb-12 max-w-2xl">
          Define policy once, enforce everywhere. GAL translates your governance rules to each platform&apos;s native configuration format.
        </p>
        <div className="grid md:grid-cols-3 gap-6">
          {platforms.map((platform, index) => (
            <Link key={index} href={platform.link} className="bg-gray-50 p-5 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors group">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-medium text-black group-hover:text-green-600 transition-colors">{platform.name}</h3>
                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-green-600 transition-colors" />
              </div>
              <p className="text-sm text-black/60">{platform.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

function FeaturesSection() {
  const features = [
    { icon: Globe, title: 'Config Discovery', description: 'Auto-discover all AI agent configurations across your repositories. CLAUDE.md, .cursorrules, copilot instructions, and more.' },
    { icon: RefreshCw, title: 'Config Sync', description: 'Push approved configurations to every developer with a single CLI command. Keep everyone aligned with organizational standards.' },
    { icon: Shield, title: 'Policy Enforcement', description: 'Define guardrails for what agents can do. Block dangerous commands, restrict file access, enforce security boundaries.' },
    { icon: Clock, title: 'Audit Trails', description: 'Every config change, every policy update, every enforcement action logged and searchable. Compliance made simple.' },
    { icon: Terminal, title: 'CLI Integration', description: 'GAL wraps your existing AI agent workflow. Sync configs, check compliance, and enforce policies from the command line.' },
    { icon: Zap, title: 'Automated Remediation', description: 'Detect misconfigured agents and automatically bring them back into compliance.' },
  ]

  return (
    <section className="py-20 px-8 bg-gray-50">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-6">
          AI governance features
        </h2>
        <p className="text-lg text-black/60 mb-12 max-w-2xl">
          Everything you need to govern AI coding agents across your organization.
        </p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
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

function AIAgentManagementSection() {
  const managementFeatures = [
    { title: 'Centralized Inventory', description: 'See all AI agents connected to your organization in one dashboard. Track which agents are active, who configured them, and what permissions they have.' },
    { title: 'Role-Based Access', description: 'Control who can configure AI agents. Assign admin, developer, and viewer roles to manage permissions across your team.' },
    { title: 'Session Monitoring', description: 'Track active agent sessions in real time. See what repositories agents are working on, what commands they are executing, and when sessions end.' },
    { title: 'Configuration Templates', description: 'Create approved configuration templates for different project types. Developers apply templates with a single command, ensuring consistency.' },
  ]

  return (
    <section className="py-20 px-8 bg-gray-50">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-6">
          AI Agent Management
        </h2>
        <p className="text-lg text-black/60 mb-12 max-w-2xl">
          Manage AI agents across your organization with centralized controls, role-based permissions, and real-time visibility into agent activity.
        </p>
        <div className="grid md:grid-cols-2 gap-8">
          {managementFeatures.map((feature, index) => (
            <div key={index} className="flex gap-4">
              <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <Users className="w-6 h-6 text-green-600" />
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

function PricingSection() {
  // Only Convenience ($10) is currently launched.
  // PricingSection uses PRICING_TIERS.slice(0, 1).
  const launchedTiers = PRICING_TIERS.slice(0, 1)

  return (
    <section className="py-20 px-8">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-6">
          Governance for every team
        </h2>
        <p className="text-lg text-black/60 mb-12 max-w-2xl">
          Start with visibility, scale to enforcement and automation as your needs grow.
        </p>
        <div className="grid md:grid-cols-1 gap-6 max-w-sm mx-auto">
          {launchedTiers.map((tier, index) => (
            <div key={index} className={`p-6 rounded-lg border ${tier.highlighted ? 'border-green-500 bg-green-50/50' : 'border-gray-100 bg-white'}`}>
              {tier.highlighted && (
                <span className="inline-block px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full mb-4">
                  Most Popular
                </span>
              )}
              <h3 className="text-xl font-medium text-black mb-1">{tier.name}</h3>
              <div className="mb-3">
                <span className="text-3xl font-bold text-black">{tier.price}</span>
                <span className="text-black/60 text-sm ml-1">{tier.unit}</span>
              </div>
              <p className="text-sm text-black/60 mb-4">{tier.description}</p>
              <ul className="space-y-2 mb-6">
                {tier.features.map((feature, fIndex) => (
                  <li key={fIndex} className="flex items-start gap-2 text-sm text-black/70">
                    <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              <a
                href={tier.cta === 'Contact Sales' ? `${DASHBOARD_URL}/contact` : `${DASHBOARD_URL}/login`}
                className={`block text-center py-2.5 px-4 rounded-full text-sm font-medium transition-colors ${tier.highlighted ? 'bg-gray-900 text-white hover:bg-gray-800' : 'bg-white text-gray-900 border border-gray-200 hover:border-gray-300'}`}
              >
                {tier.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FAQSection() {
  const faqs = [
    { question: 'What is AI agent governance?', answer: 'AI agent governance is the practice of controlling and monitoring how AI coding agents operate within an organization. It includes defining what agents can do, enforcing policies, maintaining audit trails, and ensuring compliance with security standards.' },
    { question: 'Why do I need AI governance for coding agents?', answer: 'AI coding agents like Claude Code and Cursor have broad permissions to read files, execute commands, and access your codebase. Without governance, every developer configures their agent differently, creating security risks and compliance gaps. GAL provides centralized control.' },
    { question: 'How does GAL enforce governance policies?', answer: 'GAL syncs approved configurations to developers and provides visibility into agent configurations across your organization. Policy enforcement and automated remediation are on the roadmap.' },
    { question: 'Which AI coding agents does GAL support?', answer: 'GAL supports Claude Code, Cursor, GitHub Copilot, Gemini Code Assist, and Codex. You define policies once, and GAL translates them to each platform\'s native configuration format.' },
    { question: 'Does GAL replace my AI coding agent?', answer: 'No. GAL is a governance layer that works alongside your AI coding agents. Your developers continue using Claude Code, Cursor, or Copilot as normal. GAL ensures they all operate within approved boundaries.' },
    { question: 'How long does it take to implement GAL governance?', answer: 'Most teams are up and running in under 5 minutes. Install the GAL CLI, connect your GitHub organization, and your team can start syncing approved configurations immediately.' },
    { question: 'Is GAL SOC 2 and ISO 27001 compliant?', answer: 'Yes. GAL provides the audit trails, policy documentation, and access controls required for SOC 2 and ISO 27001 compliance. The compliance dashboard generates reports for auditors.' },
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
          Start governing your AI agents today
        </h2>
        <p className="text-lg text-black/60 mb-8 max-w-xl mx-auto">
          Deploy governance across your team in under 5 minutes. Start with the free tier.
        </p>
        <a
          href={`${DASHBOARD_URL}/login`}
          className="inline-flex items-center gap-2 px-8 py-4 bg-gray-900 text-white text-base font-medium rounded-full hover:bg-gray-800 transition-colors"
        >
          Start Free Trial
          <ArrowRight className="w-5 h-5" />
        </a>
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
