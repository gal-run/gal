import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Shield, FileCheck, ScrollText, Users, CheckCircle2, AlertTriangle, Lock, BarChart3, Building2 } from 'lucide-react'
import { DASHBOARD_URL } from '@/src/config'

export const metadata: Metadata = {
  title: 'AI Compliance for AI Agents | GAL',
  description: 'Build toward AI compliance with GAL. Audit trails for AI agents that map to common compliance frameworks.',
  alternates: {
    canonical: 'https://gal.run/compliance',
  },
  openGraph: {
    title: 'AI Compliance for AI Agents | GAL',
    description: 'Build toward AI compliance with GAL. Audit trails for AI agents that map to common compliance frameworks.',
    url: 'https://gal.run/compliance',
    type: 'website',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'GAL - AI Compliance Platform',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Any',
  url: 'https://gal.run/compliance',
  description: 'Build toward AI compliance with GAL. Audit trails for AI agents that map to common compliance frameworks.',
  offers: {
    '@type': 'Offer',
    price: '10',
    priceCurrency: 'USD',
  },
}

export default function AICompliancePage() {
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
          <FeaturesSection />
          <FrameworksSection />
          <UseCasesSection />
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
              Compliance
            </span>
            <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-green-50 text-green-700 rounded-full text-sm font-medium">
              <CheckCircle2 className="w-4 h-4" />
              Audit-ready trails
            </span>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-medium tracking-tight text-black mb-6">
            AI Compliance for AI Coding Agents
          </h1>
          
          <p className="text-xl text-black/60 mb-8 leading-relaxed">
            Build toward AI compliance with GAL. Audit trails for AI coding agents that map to common frameworks like SOC 2, ISO 27001, and HIPAA. Track operations, define policies, and demonstrate governance across your entire AI agent fleet.
          </p>
          
          <div className="flex flex-wrap gap-4">
            <a
              href={`${DASHBOARD_URL}/login`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white text-sm font-medium rounded-full hover:bg-gray-800 transition-colors"
            >
              Start Free Trial
              <ArrowRight className="w-4 h-4" />
            </a>
            <Link
              href="/features/observability"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-gray-900 text-sm font-medium rounded-full border border-gray-200 hover:border-gray-300 transition-colors"
            >
              See Features
            </Link>
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
          The AI compliance challenge
        </h2>
        
        <p className="text-lg text-black/60 mb-10 max-w-2xl">
          AI coding agents operate with significant autonomy. Without proper governance, organizations struggle to meet compliance requirements and demonstrate control.
        </p>
        
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-white p-6 rounded-lg border border-gray-100">
            <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-lg font-medium text-black mb-2">No Audit Trail</h3>
            <p className="text-black/60">
              AI agents make changes without documented trails. When auditors ask what changed and why, teams scramble to reconstruct events from scattered logs.
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-lg border border-gray-100">
            <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center mb-4">
              <Lock className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-lg font-medium text-black mb-2">Uncontrolled Access</h3>
            <p className="text-black/60">
              Agents access sensitive data and systems without policy boundaries. Compliance frameworks require demonstrable access controls that most AI tooling lacks.
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-lg border border-gray-100">
            <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center mb-4">
              <ScrollText className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-lg font-medium text-black mb-2">Compliance Gaps</h3>
            <p className="text-black/60">
              SOC 2, ISO 27001, and HIPAA require change management and access controls. AI agents operating outside these frameworks create audit findings.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function SolutionSection() {
  const steps = [
    {
      step: '1',
      title: 'Connect Your Agents',
      description: 'Install GAL and connect Claude Code, Cursor, Copilot, and other AI coding agents. GAL automatically discovers configurations across your repositories.',
    },
    {
      step: '2',
      title: 'Define Compliance Policies',
      description: 'Set organizational policies for file access, command execution, and acceptable operations. GAL standardizes these across your connected agents (active enforcement coming in v1.0).',
    },
    {
      step: '3',
      title: 'Generate Audit Reports',
      description: 'Export compliance-ready reports showing all AI operations, policy enforcement actions, and change history for auditors.',
    },
  ]
  
  return (
    <section id="how-it-works" className="py-20 px-8">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-6">
          How GAL enables AI agent compliance
        </h2>
        
        <p className="text-lg text-black/60 mb-12 max-w-2xl">
          GAL provides the governance layer between your organization and AI coding agents, ensuring every operation is tracked, controlled, and auditable.
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

function FeaturesSection() {
  const features = [
    {
      icon: ScrollText,
      title: 'Audit Trails',
      description: 'Every AI operation logged with timestamp, user, repository, and action. Exportable logs for compliance audits and incident investigation.',
    },
    {
      icon: Shield,
      title: 'Policy Enforcement',
      description: 'Define what agents can and cannot do as one canonical ruleset for dangerous commands and file access. Active blocking enforcement is coming in v1.0.',
    },
    {
      icon: BarChart3,
      title: 'Compliance Reporting',
      description: 'Generate audit reports that map to common frameworks like SOC 2, ISO 27001, and HIPAA. Demonstrate governance to auditors without manual documentation.',
    },
    {
      icon: FileCheck,
      title: 'Change Management',
      description: 'Track all configuration changes with approval workflows. Maintain change history for compliance requirements.',
    },
  ]
  
  return (
    <section className="py-20 px-8 bg-gray-50">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-6">
          Compliance features for AI agents
        </h2>
        
        <p className="text-lg text-black/60 mb-12 max-w-2xl">
          GAL provides comprehensive tools to track, control, and report on AI agent activity across your organization.
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

function FrameworksSection() {
  const frameworks = [
    {
      name: 'SOC 2 Type II',
      description: 'Demonstrate security controls for AI operations. Audit trails for change management, access controls, and monitoring. Learn more at the AICPA SOC 2 resource.',
      controls: ['Change management', 'Access control', 'Monitoring', 'Risk assessment'],
      link: 'https://www.aicpa.org/soc2so',
    },
    {
      name: 'ISO 27001',
      description: 'Meet information security management requirements. Document policies, controls, and evidence for AI agent governance.',
      controls: ['Asset management', 'Access control', 'Cryptography', 'Operations security'],
      link: 'https://www.iso.org/standard/27001',
    },
    {
      name: 'HIPAA',
      description: 'Protect PHI when AI agents access healthcare systems. Audit logs, access controls, and breach detection.',
      controls: ['Audit controls', 'Access management', 'Integrity', 'Transmission security'],
    },
  ]
  
  return (
    <section className="py-20 px-8">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-6">
          Compliance frameworks we map to
        </h2>

        <p className="text-lg text-black/60 mb-12 max-w-2xl">
          GAL is building toward common compliance frameworks for AI agent governance, mapping its audit trails and controls to the requirements organizations need to meet.
        </p>
        
        <div className="grid md:grid-cols-3 gap-8">
          {frameworks.map((framework, index) => (
            <div key={index} className="bg-white p-6 rounded-lg border border-gray-100">
              <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center mb-4">
                <Building2 className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-medium text-black mb-2">{framework.name}</h3>
              <p className="text-black/60 mb-4">{framework.description}</p>
              <ul className="space-y-2 mb-4">
                {framework.controls.map((control, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-black/70">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    {control}
                  </li>
                ))}
              </ul>
              {framework.link && (
                <a href={framework.link} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-green-600 hover:text-green-700 inline-flex items-center gap-1">
                  Learn more <ArrowRight className="w-3 h-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function UseCasesSection() {
  const useCases = [
    {
      icon: Shield,
      title: 'Security Teams',
      description: 'Monitor AI agent activity for security risks. Detect unauthorized access, anomalous behavior, and policy violations in real time.',
      link: '/features/observability',
    },
    {
      icon: FileCheck,
      title: 'Compliance Officers',
      description: 'Generate audit-ready reports that map to common frameworks like SOC 2, ISO 27001, and HIPAA. Demonstrate governance controls without manual documentation.',
      link: '/governance',
    },
    {
      icon: Users,
      title: 'Engineering Leaders',
      description: 'Ensure consistent AI agent behavior across teams. Reduce risk from misconfigured agents and uncontrolled access.',
    },
    {
      icon: BarChart3,
      title: 'AI Agent for Compliance Automation',
      description: 'Use GAL as your AI agent for compliance workflows. Automate audit report generation, policy enforcement, and compliance monitoring across all your AI coding agents.',
      link: '/governance',
    },
  ]
  
  return (
    <section className="py-20 px-8 bg-gray-50">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-12">
          Who uses GAL for AI compliance
        </h2>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {useCases.map((useCase, index) => (
            <div key={index} className="bg-white p-6 rounded-lg border border-gray-100">
              <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center mb-4">
                <useCase.icon className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-lg font-medium text-black mb-3">{useCase.title}</h3>
              <p className="text-black/60">{useCase.description}</p>
              {useCase.link && (
                <Link href={useCase.link} className="inline-flex items-center gap-1 mt-4 text-sm font-medium text-green-600 hover:text-green-700">
                  Learn more
                  <ArrowRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FAQSection() {
  const faqs = [
    {
      question: 'What is AI compliance?',
      answer: 'AI compliance refers to the processes and controls that ensure AI systems, including AI coding agents, operate within regulatory and organizational requirements. This includes audit trails, access controls, change management, and demonstrating governance to auditors.',
    },
    {
      question: 'Why do AI agents need compliance controls?',
      answer: 'AI coding agents make autonomous decisions and changes to codebases. Without proper controls, organizations cannot demonstrate to auditors what changes were made, who authorized them, or whether sensitive data was accessed. Compliance controls provide visibility and accountability.',
    },
    {
      question: 'How does GAL help with SOC 2 compliance for AI agents?',
      answer: 'GAL provides audit trails for all AI operations, policy definitions for what agents can do, change management for configuration updates, and monitoring dashboards for ongoing oversight. These map to common SOC 2 control areas. GAL itself does not hold a SOC 2 certification.',
    },
    {
      question: 'Does GAL work with all AI coding agents?',
      answer: 'GAL supports Claude Code, Cursor, GitHub Copilot, Windsurf, Gemini Code Assist, and Codex. We continuously add support for new AI coding agents as they emerge.',
    },
    {
      question: 'Can I export audit logs for external auditors?',
      answer: 'Yes. GAL provides exportable audit reports in CSV and PDF formats. Reports include all AI operations, policy enforcement actions, and change history suitable for compliance audits.',
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
          Achieve AI compliance today
        </h2>
        
        <p className="text-lg text-black/60 mb-8 max-w-xl mx-auto">
          Start tracking and governing AI agent operations with audit trails that map to common compliance frameworks.
        </p>
        
        <a
          href={`${DASHBOARD_URL}/login`}
          className="inline-flex items-center gap-2 px-8 py-4 bg-gray-900 text-white text-base font-medium rounded-full hover:bg-gray-800 transition-colors"
        >
          Start Free Trial
          <ArrowRight className="w-5 h-5" />
        </a>
        
        <div className="mt-12 pt-8 border-t border-gray-100">
          <h3 className="text-lg font-medium text-black mb-4">Related Features</h3>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/features/security" className="text-green-600 hover:text-green-700 font-medium">
              AI Security Features
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
