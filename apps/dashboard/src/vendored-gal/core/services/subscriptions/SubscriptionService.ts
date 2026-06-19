/**
 * Subscription Service - Business logic for subscription management
 * TODO: Implement actual subscription logic
 */

import type { ISubscriptionRepository } from '../../repositories/ISubscriptionRepository'
import type { Subscription, PlanTier } from '../../domain/subscription'

export class SubscriptionService {
  constructor(private readonly subscriptionRepository: ISubscriptionRepository) {}

  async getSubscription(orgName: string): Promise<Subscription | null> {
    return this.subscriptionRepository.findByOrganization(orgName)
  }

  async createSubscription(subscription: Subscription): Promise<void> {
    return this.subscriptionRepository.create(subscription)
  }

  async upgradeSubscription(orgName: string, newTier: PlanTier, newSeatLimit: number): Promise<void> {
    return this.subscriptionRepository.upgrade(orgName, newTier, newSeatLimit)
  }

  async cancelSubscription(orgName: string): Promise<void> {
    return this.subscriptionRepository.cancel(orgName)
  }
}
