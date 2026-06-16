/**
 * PR Budget Rules
 *
 * Enforces maximum open PR limits per organization to prevent
 * overwhelming reviewers and maintain code quality.
 */

export interface PrBudgetConfig {
  maxOpenPrsPerOrg: number;
  maxOpenPrsPerAgent?: number;
}

export const DEFAULT_PR_BUDGET: PrBudgetConfig = {
  maxOpenPrsPerOrg: 20, // Max 20 open PRs per organization
  maxOpenPrsPerAgent: 5, // Max 5 open PRs per agent
};

export interface PrBudgetCheckContext {
  organizationId: string;
  currentOpenPrCount: number;
  agentId?: string;
  agentOpenPrCount?: number;
}

export interface PrBudgetCheckResult {
  allowed: boolean;
  reason?: string;
  currentCount: number;
  maxAllowed: number;
  waitTimeEstimateMinutes?: number;
}

/**
 * Check if a new PR can be created within budget
 */
export function canCreatePr(
  context: PrBudgetCheckContext,
  config: PrBudgetConfig = DEFAULT_PR_BUDGET
): PrBudgetCheckResult {
  // Check org-level budget
  if (context.currentOpenPrCount >= config.maxOpenPrsPerOrg) {
    return {
      allowed: false,
      reason: `Organization PR budget exceeded (${context.currentOpenPrCount}/${config.maxOpenPrsPerOrg})`,
      currentCount: context.currentOpenPrCount,
      maxAllowed: config.maxOpenPrsPerOrg,
      waitTimeEstimateMinutes: estimateWaitTime(context.currentOpenPrCount, config.maxOpenPrsPerOrg),
    };
  }

  // Check agent-level budget if applicable
  if (
    context.agentId &&
    context.agentOpenPrCount !== undefined &&
    config.maxOpenPrsPerAgent
  ) {
    if (context.agentOpenPrCount >= config.maxOpenPrsPerAgent) {
      return {
        allowed: false,
        reason: `Agent PR budget exceeded (${context.agentOpenPrCount}/${config.maxOpenPrsPerAgent})`,
        currentCount: context.agentOpenPrCount,
        maxAllowed: config.maxOpenPrsPerAgent,
        waitTimeEstimateMinutes: estimateWaitTime(
          context.agentOpenPrCount,
          config.maxOpenPrsPerAgent
        ),
      };
    }
  }

  return {
    allowed: true,
    currentCount: context.currentOpenPrCount,
    maxAllowed: config.maxOpenPrsPerOrg,
  };
}

/**
 * Estimate wait time until PR slot available (in minutes)
 */
function estimateWaitTime(current: number, max: number): number {
  const overage = current - max + 1;
  const avgPrMergeTimeMinutes = 30; // Assume 30 minutes average merge time
  return overage * avgPrMergeTimeMinutes;
}

/**
 * Calculate PR budget utilization percentage
 */
export function calculatePrBudgetUtilization(
  currentOpenPrCount: number,
  config: PrBudgetConfig = DEFAULT_PR_BUDGET
): number {
  // Guard against division by zero: if max is 0, budget is fully utilized
  if (config.maxOpenPrsPerOrg === 0) {
    return 100;
  }
  return Math.round((currentOpenPrCount / config.maxOpenPrsPerOrg) * 100);
}

/**
 * Determine if dispatch should be throttled based on PR budget
 */
export function shouldThrottleDispatch(
  currentOpenPrCount: number,
  config: PrBudgetConfig = DEFAULT_PR_BUDGET,
  thresholdPercentage: number = 80
): boolean {
  const utilization = calculatePrBudgetUtilization(currentOpenPrCount, config);
  return utilization >= thresholdPercentage;
}

/**
 * Get recommended max concurrent dispatches based on current PR budget
 */
export function getRecommendedConcurrentDispatches(
  currentOpenPrCount: number,
  config: PrBudgetConfig = DEFAULT_PR_BUDGET
): number {
  const utilization = calculatePrBudgetUtilization(currentOpenPrCount, config);

  if (utilization >= 90) return 1; // Near capacity, dispatch one at a time
  if (utilization >= 75) return 2; // High utilization, dispatch 2 at a time
  if (utilization >= 50) return 3; // Medium utilization, dispatch 3 at a time

  return 5; // Low utilization, dispatch up to 5 at a time
}
