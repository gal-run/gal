/**
 * Application-wide constants and configuration
 */
export const config = {
  // Base URL
  baseUrl: "https://gal.run",

  // GitHub
  github: {
    repoUrl: "https://github.com/gal-run/gal-code",
    starsFormatted: {
      compact: "140K",
      full: "140,000",
    },
  },

  // Social links
  social: {
    twitter: "https://x.com/gal-code",
    discord: "https://discord.gg/gal-code",
  },

  // Static stats (used on landing page)
  stats: {
    contributors: "850",
    commits: "11,000",
    monthlyUsers: "6.5M",
  },
} as const
