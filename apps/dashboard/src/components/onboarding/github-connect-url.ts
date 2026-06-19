import { api } from '@/lib/api'

type GitHubAppInstallUrlProvider = Pick<typeof api, 'getGitHubAppInstallUrl'>

export function getGitHubOnboardingInstallUrl(
  provider: GitHubAppInstallUrlProvider = api,
): string {
  return provider.getGitHubAppInstallUrl('/onboarding')
}
