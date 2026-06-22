'use client'

import { Code, Lock, Zap, Shield, Terminal, ExternalLink } from 'lucide-react'

function APIReference() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            API Reference
          </h1>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--accent-bg)', color: 'var(--accent)' }}>
            REST API
          </span>
        </div>
        <p style={{ color: 'var(--text-muted)' }} className="text-sm sm:text-base">
          Integrate GAL into your workflows with our REST API
        </p>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        {[
          { icon: Lock, label: 'Authentication', href: '#authentication' },
          { icon: Zap, label: 'Endpoints', href: '#endpoints' },
          { icon: Shield, label: 'Security', href: '#security' },
        ].map(({ href, icon: Icon, label }) => (
          <a
            key={href}
            href={href}
            className="dashboard-card p-3 transition-colors group"
          >
            <Icon className="w-5 h-5 mb-2" style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {label}
            </span>
          </a>
        ))}
      </div>

      {/* Base URL */}
      <section className="dashboard-card p-4 sm:p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Base URL
        </h2>
        <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-code)', border: '1px solid var(--border-subtle)' }}>
          <code className="text-sm" style={{ color: 'var(--accent)' }}>
            https://api.gal.run
          </code>
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
          All API requests should be made to this base URL
        </p>
      </section>

      {/* Authentication */}
      <section id="authentication" className="dashboard-card p-4 sm:p-6 mb-6 scroll-mt-20">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-bg)' }}>
            <Lock className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          </div>
          <h2 className="text-base sm:text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Authentication
          </h2>
        </div>

        <div className="space-y-4">
          <div>
            <h4 className="font-medium mb-2 text-sm" style={{ color: 'var(--text-primary)' }}>
              JWT Bearer Token
            </h4>
            <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
              All authenticated requests require a JWT token in the Authorization header:
            </p>
            <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-code)', border: '1px solid var(--border-subtle)' }}>
              <code className="text-xs" style={{ color: 'var(--accent)' }}>
                Authorization: Bearer &lt;your_jwt_token&gt;
              </code>
            </div>
          </div>

          <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
            <h4 className="font-medium mb-1 text-sm" style={{ color: 'var(--text-primary)' }}>
              Getting Your Token
            </h4>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Use the CLI to authenticate and obtain a token:
            </p>
            <div className="mt-2 p-2 rounded" style={{ backgroundColor: 'var(--bg-code)' }}>
              <code className="text-xs" style={{ color: 'var(--accent)' }}>
                gal auth login
              </code>
            </div>
          </div>
        </div>
      </section>

      {/* Core Endpoints */}
      <section id="endpoints" className="dashboard-card p-4 sm:p-6 mb-6 scroll-mt-20">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-bg)' }}>
            <Zap className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          </div>
          <h2 className="text-base sm:text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Core Endpoints
          </h2>
        </div>

        <div className="space-y-4">
          {/* Organizations */}
          <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--accent-bg)', color: 'var(--accent)' }}>
                GET
              </span>
              <code className="text-xs" style={{ color: 'var(--text-primary)' }}>
                /workspaces
              </code>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              List all organizations with GAL installed
            </p>
          </div>

          {/* Org Details */}
          <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--accent-bg)', color: 'var(--accent)' }}>
                GET
              </span>
              <code className="text-xs" style={{ color: 'var(--text-primary)' }}>
                /workspaces/:orgName
              </code>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Get details for a specific organization
            </p>
          </div>

          {/* Approved Config */}
          <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--accent-bg)', color: 'var(--accent)' }}>
                GET
              </span>
              <code className="text-xs" style={{ color: 'var(--text-primary)' }}>
                /workspaces/:orgName/approved-config
              </code>
            </div>
            <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
              Get the organization&apos;s approved AI coding tool configuration
            </p>
            <div className="text-xs p-2 rounded" style={{ backgroundColor: 'var(--bg-code)' }}>
              <div style={{ color: 'var(--text-muted)' }}>Response:</div>
              <code style={{ color: 'var(--accent)' }}>
                {`{
  "approvedConfig": {
    "sourceOrg": "org-name",
    "sourceRepo": "repo-name",
    "settings": {...},
    "commands": [...],
    "hooks": [...]
  }
}`}
              </code>
            </div>
          </div>

          {/* Scan Trigger */}
          <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--accent-bg)', color: 'var(--accent)' }}>
                POST
              </span>
              <code className="text-xs" style={{ color: 'var(--text-primary)' }}>
                /scan/:orgName
              </code>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Trigger a manual scan of organization repositories
            </p>
          </div>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="dashboard-card p-4 sm:p-6 mb-6 scroll-mt-20">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-bg)' }}>
            <Shield className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          </div>
          <h2 className="text-base sm:text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Security
          </h2>
        </div>

        <div className="space-y-3">
          <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
            <h4 className="font-medium mb-1 text-sm" style={{ color: 'var(--text-primary)' }}>
              HTTPS Only
            </h4>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              All API requests must be made over HTTPS. HTTP requests will be rejected.
            </p>
          </div>

          <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
            <h4 className="font-medium mb-1 text-sm" style={{ color: 'var(--text-primary)' }}>
              Rate Limiting
            </h4>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              General endpoints: 100 requests/minute. Auth endpoints: 10 requests/minute.
            </p>
          </div>

          <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
            <h4 className="font-medium mb-1 text-sm" style={{ color: 'var(--text-primary)' }}>
              Organization Access
            </h4>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Users can only access organizations they are members of. Cross-org access is not permitted.
            </p>
          </div>
        </div>
      </section>

      {/* CLI Integration */}
      <section className="dashboard-card p-4 sm:p-6 mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-bg)' }}>
            <Terminal className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          </div>
          <h2 className="text-base sm:text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            CLI Integration
          </h2>
        </div>

        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          The GAL CLI provides a convenient way to interact with the API:
        </p>

        <div className="space-y-2">
          <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-code)', border: '1px solid var(--border-subtle)' }}>
            <code className="text-xs" style={{ color: 'var(--accent)' }}>
              <span style={{ color: 'var(--text-muted)' }}>$ </span>gal auth login
            </code>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Authenticate with GitHub OAuth
            </p>
          </div>

          <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-code)', border: '1px solid var(--border-subtle)' }}>
            <code className="text-xs" style={{ color: 'var(--accent)' }}>
              <span style={{ color: 'var(--text-muted)' }}>$ </span>gal sync --pull
            </code>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Pull approved config from API
            </p>
          </div>
        </div>
      </section>

      {/* Additional Resources */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Additional Resources
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a
            href="https://github.com/gal-run/gal"
            target="_blank"
            rel="noopener noreferrer"
            className="dashboard-card p-4 transition-colors group flex items-center justify-between"
          >
            <div>
              <h4 className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>GitHub Repository</h4>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>View source code and examples</p>
            </div>
            <ExternalLink className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </a>

          <a
            href="/docs"
            className="dashboard-card p-4 transition-colors group flex items-center justify-between"
          >
            <div>
              <h4 className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Documentation</h4>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Getting started guide</p>
            </div>
            <Code className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </a>
        </div>
      </section>
    </div>
  )
}

export default APIReference
