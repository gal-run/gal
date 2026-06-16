/**
 * HTTP Repository Adapters for Dashboard
 *
 * Exports HTTP adapters for Dashboard (cookie-based authentication)
 * These adapters communicate with the API via HTTP instead of direct Firestore access
 */

export type { HttpClientConfig } from './HttpOrganizationRepository'

export { HttpOrganizationRepository } from './HttpOrganizationRepository'
export { HttpUserRepository } from './HttpUserRepository'
export { HttpScanResultRepository } from './HttpScanResultRepository'
export { HttpSubscriptionRepository } from './HttpSubscriptionRepository'
