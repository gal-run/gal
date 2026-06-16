/**
 * HTTP Repository Adapter for Subscriptions
 *
 * Implements ISubscriptionRepository using HTTP calls to the API.
 * Shared across Dashboard, CLI, and VS Code clients.
 */

import { Subscription, type ISubscriptionRepository, type PlanTier } from '@gal/core'
import type { ManualGrant } from '@gal/core'
import { HttpClient, type HttpClientConfig } from '../HttpClient'

interface SubscriptionApiResponse {
  organizationName: string
  planTier: string
  seatLimit: number
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  manualGrant?: ManualGrant
  createdAt?: string
  updatedAt?: string
}

export class HttpSubscriptionRepository extends HttpClient implements ISubscriptionRepository {
  constructor(config: HttpClientConfig) {
    super(config)
  }

  // ─────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────

  async findByOrganization(orgName: string): Promise<Subscription | null> {
    try {
      const response = await this.fetch(`/organizations/${orgName}/subscription`)
      const data = (await response.json()) as { subscription: SubscriptionApiResponse }

      return this.mapToSubscription(data.subscription)
    } catch (error: unknown) {
      const err = error as Error
      if (err.message?.includes('404')) {
        return null
      }
      throw err
    }
  }

  async findByStripeCustomerId(customerId: string): Promise<Subscription | null> {
    try {
      const response = await this.fetch(`/subscriptions/stripe-customer/${customerId}`)
      const data = (await response.json()) as { subscription: SubscriptionApiResponse }

      return this.mapToSubscription(data.subscription)
    } catch (error: unknown) {
      const err = error as Error
      if (err.message?.includes('404')) {
        return null
      }
      throw err
    }
  }

  async findByStripeSubscriptionId(subscriptionId: string): Promise<Subscription | null> {
    try {
      const response = await this.fetch(
        `/subscriptions/stripe-subscription/${subscriptionId}`
      )
      const data = (await response.json()) as { subscription: SubscriptionApiResponse }

      return this.mapToSubscription(data.subscription)
    } catch (error: unknown) {
      const err = error as Error
      if (err.message?.includes('404')) {
        return null
      }
      throw err
    }
  }

  async findByPlanTier(tier: PlanTier): Promise<Subscription[]> {
    const response = await this.fetch(`/subscriptions?planTier=${tier}`)
    const data = (await response.json()) as { subscriptions: SubscriptionApiResponse[] }

    return data.subscriptions.map((sub) => this.mapToSubscription(sub))
  }

  // Extra helper (not part of core interface)
  async findActiveSubscriptions(): Promise<Subscription[]> {
    return this.findActive()
  }

  async findActive(): Promise<Subscription[]> {
    const response = await this.fetch('/subscriptions/active')
    const data = (await response.json()) as { subscriptions: SubscriptionApiResponse[] }

    return data.subscriptions.map((sub) => this.mapToSubscription(sub))
  }

  async findManuallyGranted(): Promise<Subscription[]> {
    const response = await this.fetch('/subscriptions/manual-granted')
    const data = (await response.json()) as { subscriptions: SubscriptionApiResponse[] }

    return data.subscriptions.map((sub) => this.mapToSubscription(sub))
  }

  // Extra helper (not part of core interface)
  async exists(orgName: string): Promise<boolean> {
    const subscription = await this.findByOrganization(orgName)
    return subscription !== null
  }

  // ─────────────────────────────────────────────────────────────────
  // Commands
  // ─────────────────────────────────────────────────────────────────

  async create(subscription: Subscription): Promise<void> {
    await this.fetch('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        organizationName: subscription.organizationName,
        planTier: subscription.planTier,
        seatLimit: subscription.seatLimit,
        stripeCustomerId: subscription.stripeCustomerId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        manualGrant: subscription.manualGrant,
      }),
    })
  }

  async update(subscription: Subscription): Promise<void> {
    await this.fetch(`/subscriptions/${subscription.organizationName}`, {
      method: 'PUT',
      body: JSON.stringify({
        planTier: subscription.planTier,
        seatLimit: subscription.seatLimit,
        stripeCustomerId: subscription.stripeCustomerId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        manualGrant: subscription.manualGrant,
      }),
    })
  }

  async delete(orgName: string): Promise<void> {
    await this.fetch(`/subscriptions/${orgName}`, {
      method: 'DELETE',
    })
  }

  async upgrade(orgName: string, newTier: PlanTier, newSeatLimit: number): Promise<void> {
    await this.fetch(`/subscriptions/${orgName}/upgrade`, {
      method: 'PUT',
      body: JSON.stringify({
        planTier: newTier,
        seatLimit: newSeatLimit,
      }),
    })
  }

  async downgrade(orgName: string, newTier: PlanTier, newSeatLimit: number): Promise<void> {
    await this.fetch(`/subscriptions/${orgName}/downgrade`, {
      method: 'PUT',
      body: JSON.stringify({
        planTier: newTier,
        seatLimit: newSeatLimit,
      }),
    })
  }

  async cancel(orgName: string): Promise<void> {
    await this.fetch(`/subscriptions/${orgName}/cancel`, {
      method: 'POST',
    })
  }

  // Extra helpers (not part of core interface)

  async grantManualAccess(
    orgName: string,
    planTier: 'free' | 'convenience' | 'enforcement' | 'enterprise',
    seatLimit: number,
    expiresAt?: Date
  ): Promise<void> {
    await this.fetch(`/subscriptions/${orgName}/manual-grant`, {
      method: 'POST',
      body: JSON.stringify({
        planTier,
        seatLimit,
        expiresAt: expiresAt?.toISOString(),
      }),
    })
  }

  async updateStripeIds(
    orgName: string,
    stripeCustomerId: string,
    stripeSubscriptionId: string
  ): Promise<void> {
    await this.fetch(`/subscriptions/${orgName}/stripe`, {
      method: 'PUT',
      body: JSON.stringify({
        stripeCustomerId,
        stripeSubscriptionId,
      }),
    })
  }

  // ─────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────

  private mapToSubscription(data: SubscriptionApiResponse): Subscription {
    return new Subscription(
      data.organizationName,
      data.planTier as PlanTier,
      data.seatLimit,
      data.stripeCustomerId || undefined,
      data.stripeSubscriptionId || undefined,
      data.manualGrant,
      data.createdAt ? new Date(data.createdAt) : new Date(),
      data.updatedAt ? new Date(data.updatedAt) : new Date()
    )
  }
}