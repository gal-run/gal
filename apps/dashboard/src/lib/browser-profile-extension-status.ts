export interface BrowserProfileExtensionStatus {
  tone: 'loading' | 'missing' | 'ready'
  title: string
  description: string
  steps: string[]
}

export function getBrowserProfileExtensionStatus(
  extensionVersion: string | null | undefined,
): BrowserProfileExtensionStatus {
  if (extensionVersion === undefined) {
    return {
      tone: 'loading',
      title: 'Checking extension status',
      description: 'Looking for the last Chrome extension version reported by your account.',
      steps: [
        'If you already have the extension, keep this page open for a moment.',
      ],
    }
  }

  if (extensionVersion === null) {
    return {
      tone: 'missing',
      title: 'Chrome extension not detected yet',
      description:
        'No extension version has been reported for your account. Install the GAL Chrome extension, sign in, then use it on the logged-in site you want agents to access.',
      steps: [
        'Install the GAL Chrome extension.',
        'Sign in through the extension popup.',
        'Open the target site and click "Save Browser Auth".',
        'Return here and refresh this page.',
      ],
    }
  }

  return {
    tone: 'ready',
    title: `Chrome extension ready (v${extensionVersion})`,
    description:
      'The extension has reported into this account. Use it on the logged-in site you want agents to access, then refresh this page to review the saved profile.',
    steps: [
      'Open the target site in Chrome.',
      'Open the GAL extension popup.',
      'Click "Save Browser Auth" on that site.',
      'Refresh this page to confirm the profile appears.',
    ],
  }
}
