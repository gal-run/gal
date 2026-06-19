import type {
  GitHubInstallationStatus,
  Organization,
  PersonalGitHubStatus,
} from './api'

type GitHubStatusLoader = Pick<GitHubInstallationStatus, 'hasInstallations'> | null | undefined

export interface HomeGitHubBootstrap {
  githubStatus: PersonalGitHubStatus
  hasInstallations: boolean
}

export interface WorkspaceSwitcherBootstrap {
  organizations: Organization[]
  hasLiveInstallations: boolean
}

const DISCONNECTED_GITHUB_STATUS: PersonalGitHubStatus = {
  connected: false,
  username: undefined,
}

export async function loadHomeGitHubBootstrap(loaders: {
  getPersonalGitHubStatus: () => Promise<PersonalGitHubStatus>
  getGitHubAppStatus: () => Promise<GitHubStatusLoader>
}): Promise<HomeGitHubBootstrap> {
  const [githubStatusResult, appStatusResult] = await Promise.allSettled([
    loaders.getPersonalGitHubStatus(),
    loaders.getGitHubAppStatus(),
  ])

  return {
    githubStatus:
      githubStatusResult.status === 'fulfilled'
        ? githubStatusResult.value
        : DISCONNECTED_GITHUB_STATUS,
    hasInstallations:
      appStatusResult.status === 'fulfilled'
        ? appStatusResult.value?.hasInstallations ?? false
        : false,
  }
}

export async function loadWorkspaceSwitcherBootstrap(loaders: {
  getOrganizations: () => Promise<Organization[]>
  getGitHubAppStatus: () => Promise<GitHubStatusLoader>
}): Promise<WorkspaceSwitcherBootstrap> {
  const [organizationsResult, appStatusResult] = await Promise.allSettled([
    loaders.getOrganizations(),
    loaders.getGitHubAppStatus(),
  ])

  return {
    organizations:
      organizationsResult.status === 'fulfilled'
        ? organizationsResult.value
        : [],
    hasLiveInstallations:
      appStatusResult.status === 'fulfilled'
        ? appStatusResult.value?.hasInstallations ?? false
        : false,
  }
}
