import Link from "next/link";
import { FEATURE_FLAGS, DASHBOARD_URL, SOCIAL_LINKS } from "../config";

export function Footer() {
  return (
    <footer className="bg-[#0A0A0B] border-t border-white/10 relative overflow-hidden">
      {/* Background design elements */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-[#00FF2A]/3 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-[#00FF2A]/2 rounded-full blur-3xl translate-y-1/2" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-16">
        {/* Main footer grid - 4 columns spread edge to edge */}
        <div className="flex flex-col md:flex-row md:justify-between gap-12 mb-12">
          {/* Brand column */}
          <div className="md:max-w-xs">
            <div className="flex items-center gap-3 mb-4">
              <svg viewBox="0 0 36 36" className="w-10 h-10" fill="none">
                <path d="M8 12L18 6L28 12V18L18 12L8 18V12Z" fill="white" />
                <path
                  d="M8 18L18 12L28 18V24L18 18L8 24V18Z"
                  fill="white"
                  fillOpacity="0.6"
                />
                <path
                  d="M8 24L18 18L28 24V30L18 24L8 30V24Z"
                  fill="white"
                  fillOpacity="0.3"
                />
              </svg>
              <span className="text-4xl font-black tracking-tight text-white">
                gal.run
              </span>
            </div>
            <p className="text-gray-500 text-sm mb-6 leading-relaxed">
              The governance layer for AI coding agents. One source of truth for
              every agent in your organization.
            </p>
            {/* Social icons */}
            <div className="flex items-center gap-3">
              <a
                href={SOCIAL_LINKS.github}
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-[#00FF2A] hover:border-[#00FF2A]/30 transition-all"
              >
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    fillRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    clipRule="evenodd"
                  />
                </svg>
              </a>
              <a
                href={SOCIAL_LINKS.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-[#00FF2A] hover:border-[#00FF2A]/30 transition-all"
              >
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </a>
              <a
                href={SOCIAL_LINKS.twitter}
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-[#00FF2A] hover:border-[#00FF2A]/30 transition-all"
              >
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">
              Product
            </h4>
            <ul className="space-y-3">
              <li>
                <a
                  href="#how-it-works"
                  className="text-gray-400 hover:text-[#00FF2A] transition-colors text-sm"
                >
                  How It Works
                </a>
              </li>
              <li>
                <a
                  href="#features"
                  className="text-gray-400 hover:text-[#00FF2A] transition-colors text-sm"
                >
                  Features
                </a>
              </li>
              {FEATURE_FLAGS.showPricing && (
                <li>
                  <a
                    href="#pricing"
                    className="text-gray-400 hover:text-[#00FF2A] transition-colors text-sm"
                  >
                    Pricing
                  </a>
                </li>
              )}
              <li>
                <Link
                  href="/features/observability"
                  className="text-gray-400 hover:text-[#00FF2A] transition-colors text-sm"
                >
                  AI Observability
                </Link>
              </li>
              <li>
                <Link
                  href="/features/security"
                  className="text-gray-400 hover:text-[#00FF2A] transition-colors text-sm"
                >
                  AI Security
                </Link>
              </li>
              <li>
                <Link
                  href="/compliance"
                  className="text-gray-400 hover:text-[#00FF2A] transition-colors text-sm"
                >
                  AI Compliance
                </Link>
              </li>
              <li>
                <Link
                  href="/governance"
                  className="text-gray-400 hover:text-[#00FF2A] transition-colors text-sm"
                >
                  AI Governance
                </Link>
              </li>
            </ul>
          </div>

          {/* Integrations */}
          <div>
            <h4 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">
              Integrations
            </h4>
            <ul className="space-y-3">
              <li>
                <Link
                  href="/integrations/claude-code"
                  className="text-gray-400 hover:text-[#00FF2A] transition-colors text-sm"
                >
                  Claude Code
                </Link>
              </li>
              <li>
                <Link
                  href="/integrations/cursor"
                  className="text-gray-400 hover:text-[#00FF2A] transition-colors text-sm"
                >
                  Cursor
                </Link>
              </li>
              <li>
                <Link
                  href="/integrations/copilot"
                  className="text-gray-400 hover:text-[#00FF2A] transition-colors text-sm"
                >
                  GitHub Copilot
                </Link>
              </li>
              <li>
                <Link
                  href="/integrations/gemini"
                  className="text-gray-400 hover:text-[#00FF2A] transition-colors text-sm"
                >
                  Gemini Code Assist
                </Link>
              </li>
              <li>
                <Link
                  href="/integrations/codex"
                  className="text-gray-400 hover:text-[#00FF2A] transition-colors text-sm"
                >
                  OpenAI Codex
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">
              Resources
            </h4>
            <ul className="space-y-3">
              <li>
                <a
                  href={SOCIAL_LINKS.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-[#00FF2A] transition-colors text-sm"
                >
                  GitHub
                </a>
              </li>
              <li>
                <a
                  href={DASHBOARD_URL}
                  className="text-gray-400 hover:text-[#00FF2A] transition-colors text-sm"
                >
                  Dashboard
                </a>
              </li>
              <li>
                <a
                  href="/blog"
                  className="text-gray-400 hover:text-[#00FF2A] transition-colors text-sm"
                >
                  Blog
                </a>
              </li>
              <li>
                <a
                  href="/docs"
                  className="text-gray-400 hover:text-[#00FF2A] transition-colors text-sm"
                >
                  Docs
                </a>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">
              Company
            </h4>
            <ul className="space-y-3">
              <li>
                <a
                  href="/vision"
                  className="text-gray-400 hover:text-[#00FF2A] transition-colors text-sm"
                >
                  Vision
                </a>
              </li>
              <li>
                <a
                  href="https://scheduler-systems.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-[#00FF2A] transition-colors text-sm"
                >
                  About
                </a>
              </li>
              <li>
                <a
                  href="mailto:contact@scheduler-systems.com"
                  className="text-gray-400 hover:text-[#00FF2A] transition-colors text-sm"
                >
                  Contact
                </a>
              </li>
              <li>
                <a
                  href="https://scheduler-systems.com/legal#gal-privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-[#00FF2A] transition-colors text-sm"
                >
                  Privacy
                </a>
              </li>
              <li>
                <a
                  href="https://scheduler-systems.com/legal#gal-terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-[#00FF2A] transition-colors text-sm"
                >
                  Terms
                </a>
              </li>
              <li>
                <a
                  href="https://scheduler-systems.com/legal#gal-privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-[#00FF2A] transition-colors text-sm"
                >
                  Security
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col items-center pt-8 border-t border-white/10 gap-3">
          <span className="text-gray-500 text-sm">
            &copy; {new Date().getFullYear()} Scheduler Systems Ltd.
          </span>
          <div className="flex items-center gap-2 text-gray-600 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00FF2A] shadow-[0_0_8px_rgba(0,255,42,0.6)]" />
            <span>All systems operational</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
