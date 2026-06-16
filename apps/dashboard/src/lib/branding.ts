const shortName = 'GAL'
const fullName = 'Governance Agentic Layer'
const siteUrl = 'https://gal.run'

export const BRANDING = {
  shortName,
  fullName,
  fullProductName: `${shortName} - ${fullName}`,
  logoLabel: `${shortName} logo`,
  missionControlName: `${shortName} Mission Control`,
  dashboardTitle: `${shortName} Dashboard - Mission Control`,
  dashboardDescription: `${shortName} Dashboard - ${fullName} mission control for AI coding agents.`,
  dashboardOpenGraphDescription: 'Monitor and manage your AI agent governance',
  footerTagline: 'Enterprise AI Agent Management',
  siteUrl,
  siteHost: 'gal.run',
  signupUrl: 'https://app.gal.run/signup',
  contactUrl: `${siteUrl}/contact`,
} as const
