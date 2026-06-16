// Auth types - separated for cleaner imports

// Auth provider type for unified authentication (GAL-569)
export type AuthProviderType = 'github' | 'google' | 'email'

export interface User {
  id: string
  githubId: number
  login: string
  name: string | null
  email: string | null
  avatarUrl: string
  organizations: string[]
  adminOrganizations: string[]  // GAL-569: Orgs where user is owner/admin
  isAdmin: boolean  // True if admin in at least one org
  providers?: AuthProviderType[]  // GAL-569: Linked auth providers
  /** ToS/Privacy acceptance timestamp (#3065) */
  termsAcceptedAt?: string
  /** Version of terms accepted (#3065) */
  termsVersion?: string
}

export interface AuthStatus {
  configured: boolean
  user: User | null
}
