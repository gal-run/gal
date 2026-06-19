import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Settings, FileText, Code, Shield, GitBranch, Zap, FolderTree, CheckCircle2, BookOpen, Terminal, Cpu } from 'lucide-react'
import { DASHBOARD_URL } from '@/src/config'

export const metadata: Metadata = {
  title: 'AI Agent Environment Configuration | GAL',
  description: 'Configure AI agent environments with GAL. Manage CLAUDE.md, settings.json, custom commands, and MCP servers across your team.',
  alternates: {
    canonical: 'https://gal.run/features/config',
  },
  openGraph: {
    title: 'AI Agent Environment Configuration | GAL',
    description: 'Configure AI agent environments with GAL. Manage CLAUDE.md, settings.json, custom commands, and MCP servers across your team.',
    url: 'https://gal.run/features/config',
    type: 'website',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'GAL - AI Agent Environment Configuration',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Any',
  url: 'https://gal.run/features/config',
  description: 'Configure AI agent environments with GAL. Manage CLAUDE.md, settings.json, custom commands, and MCP servers across your team.',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.9',
    ratingCount: '127',
  },
}

export default function ConfigFeaturePage() {
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
          <ConfigFilesSection />
          <SyncHowItWorksSection />
          <BestPracticesSection />
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
              <Settings className="w-4 h-4" />
              Feature
            </span>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-medium tracking-tight text-black mb-6">
            AI Agent Environment Configuration
          </h1>
          
          <p className="text-xl text-black/60 mb-8 leading-relaxed">
            Centralize AI agent configuration across your team. Manage CLAUDE.md instructions, permission settings, custom commands, and MCP servers from a single dashboard. Enforce consistency and governance at scale. For official Anthropic guidance, see the{' '}
            <a href="https://docs.anthropic.com/en/docs/claude-code" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 underline">
              Claude Code documentation
            </a>.
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
              href="#config-files"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-gray-900 text-sm font-medium rounded-full border border-gray-200 hover:border-gray-300 transition-colors"
            >
              See Config Files
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
          The problem with scattered agent configurations
        </h2>
        
        <p className="text-lg text-black/60 mb-12 max-w-2xl">
          AI agents rely on configuration files to understand your codebase, follow conventions, and operate within approved boundaries. Without centralized management, teams face chaos.
        </p>
        
        <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-white p-6 rounded-lg border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center">
                <FolderTree className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-lg font-medium text-black">Inconsistent Behavior</h3>
            </div>
            <p className="text-black/60">
              Different developers maintain different CLAUDE.md files locally. Agents behave differently depending on who last edited the config, leading to unpredictable outputs.
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-lg border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center">
                <Shield className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-lg font-medium text-black">Security Blind Spots</h3>
            </div>
            <p className="text-black/60">
              Permission settings live in local files that bypass code review. An agent with overly permissive settings can access sensitive data or run dangerous commands.
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-lg border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center">
                <GitBranch className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-lg font-medium text-black">Version Control Gaps</h3>
            </div>
            <p className="text-black/60">
              Configuration drift between branches and environments. What worked in development breaks in production because agent instructions diverged.
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-lg border border-gray-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center">
                <Zap className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-lg font-medium text-black">Onboarding Friction</h3>
            </div>
            <p className="text-black/60">
              New team members spend hours setting up agent configurations manually. No single source of truth for what settings the team actually uses.
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
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-6">
          GAL&apos;s centralized config management
        </h2>
        
        <p className="text-lg text-black/60 mb-12 max-w-2xl">
          GAL provides a single dashboard to define, sync, and govern AI agent configurations across your entire organization.
        </p>
        
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-gray-50 p-6 rounded-lg">
            <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center mb-4">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-lg font-medium text-black mb-2">Org-Wide Defaults</h3>
            <p className="text-black/60">
              Define approved configurations once. Apply them across all repositories and team members automatically.
            </p>
          </div>
          
          <div className="bg-gray-50 p-6 rounded-lg">
            <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center mb-4">
              <GitBranch className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-lg font-medium text-black mb-2">Git-Native Sync</h3>
            <p className="text-black/60">
              Configs sync to your repository as code. Review changes in pull requests, track history, and roll back when needed.
            </p>
          </div>
          
          <div className="bg-gray-50 p-6 rounded-lg">
            <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center mb-4">
              <Shield className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-lg font-medium text-black mb-2">Governance Controls</h3>
            <p className="text-black/60">
              Require admin approval for config changes. Detect drift from approved settings and alert security teams.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function ConfigFilesSection() {
  const configFiles = [
    {
      icon: FileText,
      filename: 'CLAUDE.md',
      title: 'Project Instructions',
      description: 'The primary instruction file that tells Claude about your project. Define coding conventions, architecture patterns, and context specific to your codebase.',
      examples: ['Coding standards', 'Project structure', 'Testing requirements', 'Deployment notes'],
    },
    {
      icon: Settings,
      filename: '.claude/settings.json',
      title: 'Permissions & Permissions',
      description: 'Control what Claude can and cannot do. Define allowed commands, file access patterns, and security boundaries for agent operations.',
      examples: ['Allowed bash commands', 'Protected file patterns', 'API key restrictions', 'Auto-approve rules'],
    },
    {
      icon: Terminal,
      filename: '.claude/commands/',
      title: 'Custom Slash Commands',
      description: 'Define reusable command templates for common workflows. Create standardized procedures that your whole team can invoke with a single command.',
      examples: ['/deploy', '/test-coverage', '/create-pr', '/review-code'],
    },
    {
      icon: Cpu,
      filename: '.claude/agents/',
      title: 'Specialized Agents',
      description: 'Configure focused sub-agents for specific tasks. Each agent can have its own instructions, tools, and constraints tailored to its purpose.',
      examples: ['Security scanner', 'Doc generator', 'Test writer', 'Code reviewer'],
    },
    {
      icon: BookOpen,
      filename: '.claude/rules/',
      title: 'Context-Specific Rules',
      description: 'Rules that apply conditionally based on file paths or context. Different instructions for different parts of your codebase.',
      examples: ['Frontend rules', 'Backend rules', 'Database rules', 'API rules'],
    },
    {
      icon: Code,
      filename: '.mcp.json',
      title: 'MCP Server Config',
      description: 'Configure Model Context Protocol servers that extend Claude with external tools and data sources. Connect to databases, APIs, and custom integrations.',
      examples: ['Database connectors', 'API integrations', 'File systems', 'Custom tools'],
    },
  ]
  
  return (
    <section id="config-files" className="py-20 px-8 bg-gray-50">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-6">
          Configuration files GAL manages
        </h2>
        
        <p className="text-lg text-black/60 mb-12 max-w-2xl">
          GAL centralizes all the configuration files that control how AI agents interact with your codebase.
        </p>
        
        <div className="grid md:grid-cols-2 gap-8">
          {configFiles.map((config, index) => (
            <div key={index} className="bg-white p-6 rounded-lg border border-gray-100">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
                  <config.icon className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-black">{config.title}</h3>
                  <code className="text-sm text-gray-500">{config.filename}</code>
                </div>
              </div>
              <p className="text-black/60 mb-4">{config.description}</p>
              <div className="flex flex-wrap gap-2">
                {config.examples.map((example, i) => (
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

function SyncHowItWorksSection() {
  return (
    <section className="py-20 px-8">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-6">
          How config sync works
        </h2>
        
        <p className="text-lg text-black/60 mb-12 max-w-2xl">
          GAL keeps your agent configurations in sync across your team through a Git-native workflow.
        </p>
        
        <div className="grid md:grid-cols-3 gap-8">
          <div className="relative">
            <div className="text-6xl font-bold text-gray-200 mb-4">1</div>
            <h3 className="text-xl font-medium text-black mb-3">Define</h3>
            <p className="text-black/60">
              Create your approved configuration in the GAL dashboard. Set permissions, define commands, and write project instructions.
            </p>
          </div>
          
          <div className="relative">
            <div className="text-6xl font-bold text-gray-200 mb-4">2</div>
            <h3 className="text-xl font-medium text-black mb-3">Sync</h3>
            <p className="text-black/60">
              GAL pushes configuration files to your repository via pull request. Review the changes, run CI checks, and merge when approved.
            </p>
          </div>
          
          <div className="relative">
            <div className="text-6xl font-bold text-gray-200 mb-4">3</div>
            <h3 className="text-xl font-medium text-black mb-3">Enforce</h3>
            <p className="text-black/60">
              Agents automatically load the synced configuration. GAL monitors for drift and alerts when local configs diverge from approved versions.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function BestPracticesSection() {
  const practices = [
    {
      title: 'Start with CLAUDE.md',
      description: 'Begin with a clear CLAUDE.md that documents your project structure, coding conventions, and key architectural decisions. This is the single most impactful configuration file.',
    },
    {
      title: 'Lock Down Permissions',
      description: 'Use settings.json to restrict dangerous operations. Block commands like `rm -rf`, limit file access to project directories, and require approval for production deployments.',
    },
    {
      title: 'Create Standard Commands',
      description: 'Define slash commands for repetitive workflows. Standardize how your team runs tests, creates PRs, and deploys code to ensure consistency.',
    },
    {
      title: 'Use Context Rules',
      description: 'Leverage .claude/rules/ to provide different instructions for different parts of your codebase. Frontend code might need different conventions than backend services.',
    },
    {
      title: 'Review Config Changes',
      description: 'Treat configuration changes like any other code change. Require PR review, run CI checks, and maintain a history of who approved what changes.',
    },
    {
      title: 'Monitor for Drift',
      description: 'Enable drift detection to catch when local configurations diverge from the approved version. This helps maintain consistency and security.',
    },
  ]
  
  return (
    <section className="py-20 px-8 bg-gray-50">
      <div className="max-w-[1376px] mx-auto">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-6">
          Configuration best practices
        </h2>
        
        <p className="text-lg text-black/60 mb-12 max-w-2xl">
          Follow these practices to get the most out of centralized agent configuration management.
        </p>
        
        <div className="grid md:grid-cols-2 gap-8">
          {practices.map((practice, index) => (
            <div key={index} className="flex gap-4">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-green-600 font-medium text-sm">{index + 1}</span>
              </div>
              <div>
                <h3 className="text-lg font-medium text-black mb-2">{practice.title}</h3>
                <p className="text-black/60">{practice.description}</p>
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
      question: 'What is an AI agent environment?',
      answer: 'An AI agent environment consists of all the configuration files and settings that define how an AI coding agent behaves. This includes instruction files (CLAUDE.md), permission settings (settings.json), custom commands, rules, and MCP server configurations.',
    },
    {
      question: 'Why centralize agent configuration?',
      answer: 'Centralization ensures all team members use the same agent settings, prevents security issues from overly permissive local configs, and provides a single source of truth for how agents should interact with your codebase.',
    },
    {
      question: 'How does GAL detect configuration drift?',
      answer: 'GAL compares local configuration files against the approved versions stored in the GAL dashboard. When differences are detected, alerts are sent to the team and the dashboard shows exactly what changed.',
    },
    {
      question: 'Can I have different configs for different repositories?',
      answer: 'Yes. GAL supports repository-specific overrides while maintaining organization-wide defaults. Each repo can extend or override the base configuration as needed.',
    },
    {
      question: 'Does config sync require changes to my workflow?',
      answer: 'Minimal changes. GAL pushes configs via pull requests to your existing repositories. You review and merge them like any other PR. Agents automatically pick up the changes on their next session.',
    },
    {
      question: 'What happens if someone edits config locally?',
      answer: 'Local changes work for that session, but GAL will flag the drift. On the next sync, GAL will prompt to either update the approved config or reset to the approved version. This prevents configuration fragmentation.',
    },
  ]
  
  return (
    <section className="py-20 px-8">
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
    <section className="py-20 px-8 bg-gray-50">
      <div className="max-w-[1376px] mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-black mb-6">
          Centralize your AI agent configuration
        </h2>
        
        <p className="text-lg text-black/60 mb-8 max-w-xl mx-auto">
          Get team-wide configuration consistency in under 5 minutes. Free tier available.
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
        
        <div className="mt-12 pt-8 border-t border-gray-200">
          <h3 className="text-lg font-medium text-black mb-4">Related Features</h3>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/governance" className="text-green-600 hover:text-green-700 font-medium">
              AI Governance
            </Link>
            <span className="text-gray-300">|</span>
            <Link href="/features/observability" className="text-green-600 hover:text-green-700 font-medium">
              AI Observability
            </Link>
            <span className="text-gray-300">|</span>
            <Link href="/integrations/claude-code" className="text-green-600 hover:text-green-700 font-medium">
              Claude Code Integration
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
