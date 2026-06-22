import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Shield, Terminal, Lock, FileText, Globe, AlertTriangle, CheckCircle2, Ban, Eye, Settings, Zap, ShieldCheck } from 'lucide-react'
import { DASHBOARD_URL } from '@/src/config'

export const metadata: Metadata = {
  title: 'AI Security Software & Coding Security | GAL',
    description: 'AI coding security for agents. Define one canonical ruleset for dangerous commands and file access (blocking enforcement coming in v1.0).',
  alternates: {
    canonical: 'https://gal.run/features/security',
  },
  openGraph: {
    title: 'AI Security Software & Coding Security | GAL',
  description: 'AI coding security for agents. Define one canonical ruleset for dangerous commands and file access (blocking enforcement coming in v1.0).',
    url: 'https://gal.run/features/security',
    type: 'website',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'GAL - AI Security Software',
  applicationCategory: 'SecurityApplication',
  operatingSystem: 'Any',
  url: 'https://gal.run/features/security',
  description: 'AI coding security for agents. Define one canonical ruleset for dangerous commands and file access (blocking enforcement coming in v1.0).',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
}

export default function SecurityFeaturePage() {
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
          <AICodingSecuritySection />
          <SecurityFeaturesSection />
          <HowItWorksSection />
          <BalanceSection />
          <ComplianceSection />
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
            <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-red-50 text-red-700 rounded-full text-sm font-medium">
              <Shield className="w-4 h-4" />
              Security
            </span>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-medium tracking-tight text-black mb-6">
            AI Security Software &amp; Coding Security
          </h1>
          
          <p className="text-xl text-black/60 mb-8 leading-relaxed">
            Governance for Claude Code, Cursor, Copilot, and other AI coding agents. Define one canonical ruleset for dangerous commands, file access, and network operations. Active blocking enforcement at the execution layer is coming in v1.0.
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
              href="#security-features"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-gray-900 text-sm font-medium rounded-full border border-gray-200 hover:border-gray-300 transition-colors"
            >
              See Security Features
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

function ProblemSection() {
  const risks = [
    {
      title: 'Unauthorized Command Execution',
      description: 'AI agents can run destructive commands like rm -rf, curl | bash, or sudo operations without oversight.',
      example: 'rm -rf /src',
    },
    {
      title: 'Sensitive File Access',
      description: 'Agents may read or expose .env files, API keys, credentials, and other secrets.',
      example: 'Read: .env.production',
    },
    {
      title: 'Unrestricted Network Access',
      description: 'Agents can make arbitrary API calls, potentially leaking data to external services.',
      example: 'POST attacker.com/exfil',
    },
    {
      title: 'Compliance Violations',
      description: 'Without audit trails and guardrails, AI agent actions violate SOC 2, HIPAA, and other standards.',
      example: 'No audit log',
    },
  ]
  
  return (
    <section className="py-20 px-8 bg-gray-50">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-6">
          AI coding agents create new security risks
        </h2>
        
        <p className="text-lg text-black/60 mb-12 max-w-2xl">
          AI agents operate autonomously at machine speed, making them a new attack surface. Without proper controls, they can cause significant damage in seconds. For comprehensive AI security guidance, see the{' '}
          <a href="https://owasp.org/www-project-ai-security-and-privacy-guide/" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 underline">
            OWASP AI Security and Privacy Guide
          </a>.
        </p>
        
        <div className="grid md:grid-cols-2 gap-8">
          {risks.map((risk, index) => (
            <div key={index} className="bg-white p-6 rounded-lg border border-red-100">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <h3 className="text-lg font-medium text-black">{risk.title}</h3>
              </div>
              <p className="text-black/60 mb-3">{risk.description}</p>
              <code className="text-xs bg-red-50 px-2 py-1 rounded text-red-700">
                {risk.example}
              </code>
            </div>
          ))}
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
            GAL adds a security layer between agents and your systems
          </h2>
          
          <p className="text-lg text-black/60 mb-8">
            GAL installs your security policies as one canonical ruleset across every agent and logs what they do. Real-time interception and enforcement — a firewall for AI coding agents — is in active development for v1.0.
          </p>
          
          <div className="flex flex-wrap gap-4">
            <Link
              href="/governance"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-900 text-sm font-medium rounded-full hover:bg-gray-200 transition-colors"
            >
              <ShieldCheck className="w-4 h-4" />
              AI Governance
            </Link>
            <Link
              href="/compliance"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-900 text-sm font-medium rounded-full hover:bg-gray-200 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              Compliance
            </Link>
            <Link
              href="/features/observability"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-900 text-sm font-medium rounded-full hover:bg-gray-200 transition-colors"
            >
              <Eye className="w-4 h-4" />
              Observability
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

function AICodingSecuritySection() {
  return (
    <section className="py-20 px-8 bg-gray-50">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-6">
          AI Coding Security
        </h2>
        
        <p className="text-lg text-black/60 mb-12 max-w-2xl">
          AI coding security protects your development environment from the unique risks introduced by AI-powered coding assistants. As tools like Claude Code, Cursor, and GitHub Copilot become essential to developer workflows, they create new attack vectors that traditional security tools cannot address.
        </p>
        
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-white p-6 rounded-lg">
            <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center mb-4">
              <Terminal className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="text-lg font-medium text-black mb-2">Command Control</h3>
            <p className="text-black/60">
              AI coding security ensures agents cannot execute destructive shell commands or run unapproved scripts without oversight.
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-lg">
            <div className="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center mb-4">
              <Lock className="w-6 h-6 text-orange-600" />
            </div>
            <h3 className="text-lg font-medium text-black mb-2">Secrets Protection</h3>
            <p className="text-black/60">
              Coding security is built to stop AI agents from reading or exposing environment files, API keys, and credentials during code generation. Active blocking is coming in v1.0.
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-lg">
            <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center mb-4">
              <FileText className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-lg font-medium text-black mb-2">Audit Trails</h3>
            <p className="text-black/60">
              Complete visibility into every action taken by AI coding tools, enabling security teams to review and investigate agent behavior.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function SecurityFeaturesSection() {
  const features = [
    {
      icon: Ban,
      title: 'Command Blocking',
      description: 'Define rules to flag dangerous shell commands like rm -rf, curl | bash, sudo, and chmod 777. Blocking these before they execute is coming in v1.0.',
      examples: ['rm -rf', 'curl | bash', 'sudo', 'chmod 777', '> /dev/'],
      color: 'red',
    },
    {
      icon: Lock,
      title: 'File Access Restrictions',
      description: 'Define rules for which files agents can read, write, or modify — .env files, secrets directories, credentials, and sensitive configuration (active enforcement coming in v1.0).',
      examples: ['.env', '.env.*', 'secrets/', '*.pem', 'credentials.json'],
      color: 'orange',
    },
    {
      icon: Globe,
      title: 'Network Restrictions',
      description: 'Define which domains and endpoints agents can access to guard against data exfiltration and unauthorized API calls. Active blocking is coming in v1.0.',
      examples: ['Block: *.internal', 'Allow: api.github.com', 'Block: attacker.com'],
      color: 'blue',
    },
    {
      icon: Zap,
      title: 'Runtime Enforcement',
      description: 'Real-time policy enforcement at the execution layer is in active development for v1.0. Today gal installs git SDLC hooks and ships MCP servers; cross-agent hook install and per-tool blocking are in active development.',
      examples: ['Intercept', 'Classify', 'Enforce', 'Log'],
      color: 'green',
    },
  ]
  
  const colorClasses: Record<string, { bg: string; icon: string; code: string }> = {
    red: { bg: 'bg-red-50', icon: 'text-red-600', code: 'bg-red-50 text-red-700' },
    orange: { bg: 'bg-orange-50', icon: 'text-orange-600', code: 'bg-orange-50 text-orange-700' },
    blue: { bg: 'bg-blue-50', icon: 'text-blue-600', code: 'bg-blue-50 text-blue-700' },
    green: { bg: 'bg-green-50', icon: 'text-green-600', code: 'bg-green-50 text-green-700' },
  }
  
  return (
    <section id="security-features" className="py-20 px-8 bg-gray-50">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-6">
          Security features for AI coding agents
        </h2>
        
        <p className="text-lg text-black/60 mb-12 max-w-2xl">
          GAL provides multiple layers of security to protect your systems from AI agent risks.
        </p>
        
        <div className="grid md:grid-cols-2 gap-8">
          {features.map((feature, index) => (
            <div key={index} className="bg-white p-6 rounded-lg border border-gray-100">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-12 h-12 ${colorClasses[feature.color].bg} rounded-lg flex items-center justify-center`}>
                  <feature.icon className={`w-6 h-6 ${colorClasses[feature.color].icon}`} />
                </div>
                <h3 className="text-lg font-medium text-black">{feature.title}</h3>
              </div>
              <p className="text-black/60 mb-4">{feature.description}</p>
              <div className="flex flex-wrap gap-2">
                {feature.examples.map((example, i) => (
                  <code key={i} className={`text-xs px-2 py-1 rounded ${colorClasses[feature.color].code}`}>
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

function HowItWorksSection() {
  const steps = [
    {
      title: 'Intercept',
      description: 'GAL wraps your AI agent\'s execution environment. Every command, file operation, and network request passes through GAL before executing.',
      icon: Zap,
    },
    {
      title: 'Classify',
      description: 'GAL analyzes each operation against your security policies. Is it a blocked command? A restricted file? An unauthorized domain?',
      icon: Settings,
    },
    {
      title: 'Enforce',
      description: 'GAL records agent activity today (best-effort). Based on classification, allowing or blocking operations before any damage occurs is coming in v1.0.',
      icon: Shield,
    },
  ]
  
  return (
    <section className="py-20 px-8">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-6">
          How AI security enforcement works
        </h2>

        <p className="text-lg text-black/60 mb-12 max-w-2xl">
          GAL observes operations at the runtime level today; intercepting and blocking threats before they execute is in active development for v1.0.
        </p>
        
        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, index) => (
            <div key={index} className="relative">
              <div className="text-6xl font-bold text-gray-200 mb-4">{index + 1}</div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                  <step.icon className="w-5 h-5 text-green-600" />
                </div>
                <h3 className="text-xl font-medium text-black">{step.title}</h3>
              </div>
              <p className="text-black/60">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function BalanceSection() {
  return (
    <section className="py-20 px-8 bg-gray-50">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-6">
          Security without sacrificing productivity
        </h2>
        
        <p className="text-lg text-black/60 mb-12 max-w-2xl">
          GAL is designed to enhance security while maintaining developer velocity. Fine-tuned policies let agents work efficiently within safe boundaries.
        </p>
        
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-white p-6 rounded-lg">
            <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center mb-4">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-lg font-medium text-black mb-2">Allow by Default</h3>
            <p className="text-black/60">
              The ruleset targets only explicitly dangerous operations. Normal coding workflows continue uninterrupted, and active blocking is coming in v1.0.
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-lg">
            <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center mb-4">
              <Settings className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-lg font-medium text-black mb-2">Customizable Policies</h3>
            <p className="text-black/60">
              Define your own rules. Allow specific commands for your workflow while blocking general risks.
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-lg">
            <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center mb-4">
              <Eye className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-lg font-medium text-black mb-2">Audit & Review</h3>
            <p className="text-black/60">
              Every agent action is logged today; once active blocking ships (v1.0), blocked operations are logged too. Review activity, tune false positives, and refine policies over time.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function ComplianceSection() {
  const benefits = [
    {
      standard: 'SOC 2',
      description: 'Demonstrate access controls, audit trails, and security policies for AI agent operations.',
    },
    {
      standard: 'HIPAA',
      description: 'Define guardrails for PHI access with audit logging (active blocking coming in v1.0).',
    },
    {
      standard: 'ISO 27001',
      description: 'Meet information security requirements with documented security controls for AI agents.',
    },
    {
      standard: 'PCI DSS',
      description: 'Define rules for cardholder-data access and maintain audit trails for AI-driven code changes (active enforcement coming in v1.0).',
    },
  ]
  
  return (
    <section className="py-20 px-8">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-6">
          Compliance benefits for AI security
        </h2>
        
        <p className="text-lg text-black/60 mb-12 max-w-2xl">
          GAL is building toward common compliance frameworks, providing the security controls and audit trails organizations need for AI coding agents. GAL itself does not hold a SOC 2 or ISO 27001 certification.
        </p>
        
        <div className="grid md:grid-cols-2 gap-8">
          {benefits.map((benefit, index) => (
            <div key={index} className="flex gap-4">
              <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <ShieldCheck className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-black mb-2">{benefit.standard}</h3>
                <p className="text-black/60">{benefit.description}</p>
              </div>
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
      question: 'What is AI security software?',
      answer: 'AI security software protects systems from risks introduced by AI agents. It monitors, controls, and audits AI agent operations to prevent unauthorized commands, data exposure, and compliance violations.',
    },
    {
      question: 'What is AI coding security?',
      answer: 'AI coding security refers to the practices and tools used to secure AI-powered development tools like Claude Code, Cursor, and GitHub Copilot. This includes command blocking, file access restrictions, and audit logging.',
    },
    {
      question: 'What are AI security issues?',
      answer: 'AI security issues include unauthorized command execution, sensitive data exposure, unrestricted network access, lack of audit trails, and compliance violations. AI agents can cause these issues at machine speed without proper controls.',
    },
    {
      question: 'Does GAL work with all AI coding agents?',
      answer: 'GAL is designed to define one canonical ruleset for agents like Claude Code, Cursor, Windsurf, and Gemini. Today gal installs git SDLC hooks and ships MCP servers; cross-agent hook install, per-tool blocking, and the runtime interception layer are in active development for v1.0.',
    },
    {
      question: 'Will security enforcement slow down agents?',
      answer: 'GAL is designed to keep overhead negligible for interactive development workflows. Active blocking enforcement is in development for v1.0, and we will publish measured latency once it ships.',
    },
    {
      question: 'Can I customize security policies?',
      answer: 'Yes. GAL allows you to define custom command blocks, file restrictions, and network policies. Start with sensible defaults and refine based on your workflow needs.',
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
          Secure your AI coding agents today
        </h2>
        
        <p className="text-lg text-black/60 mb-8 max-w-xl mx-auto">
          Add runtime security to Claude Code, Cursor, and Copilot in under 5 minutes. Free tier available.
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
