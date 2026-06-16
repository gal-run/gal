/**
 * Priority Rules
 *
 * Pure business logic for priority calculation and comparison.
 * No external dependencies - operates only on domain types.
 */

import { Priority, PriorityLevel } from '../value-objects';

/**
 * Priority rule definition
 */
export interface PriorityRule {
  priority: PriorityLevel;
  labels: string[];
  type?: 'issue' | 'pr';
  description: string;
}

/**
 * Default priority rules (order matters - first match wins)
 */
export const DEFAULT_PRIORITY_RULES: PriorityRule[] = [
  {
    priority: 0,
    labels: ['blocker', 'infrastructure', 'critical'],
    description: 'P0: Critical infrastructure blockers',
  },
  {
    priority: 1,
    labels: ['auto-approve-eligible'],
    type: 'pr',
    description: 'P1: Auto-approve eligible PRs',
  },
  {
    priority: 2,
    labels: ['risk:high'],
    description: 'P2: High-risk items',
  },
  {
    priority: 2,
    labels: ['sdlc:1-blocked', 'sdlc:2-blocked', 'sdlc:3-blocked', 'sdlc:4-blocked', 'sdlc:5-blocked', 'sdlc:6-blocked', 'sdlc:7-blocked'],
    description: 'P2: SDLC blocked items',
  },
  {
    priority: 3,
    labels: ['bug', 'enhancement', 'feature'],
    description: 'P3: Standard work items',
  },
];

/**
 * Calculate priority from labels using rules
 */
export function calculatePriorityFromLabels(
  labels: string[],
  type: 'issue' | 'pr',
  rules: PriorityRule[] = DEFAULT_PRIORITY_RULES
): Priority {
  const normalizedLabels = labels.map((l) => l.toLowerCase());

  for (const rule of rules) {
    // Skip rules that don't match type
    if (rule.type && rule.type !== type) {
      continue;
    }

    // Check if any label matches
    const hasMatch = rule.labels.some((ruleLabel) =>
      normalizedLabels.some(
        (label) =>
          label === ruleLabel.toLowerCase() ||
          label.includes(ruleLabel.toLowerCase())
      )
    );

    if (hasMatch) {
      return Priority.fromNumber(rule.priority);
    }
  }

  // Default to P3 (standard)
  return Priority.P3_STANDARD;
}

/**
 * Sort work items by priority (highest priority first)
 */
export function sortByPriority<T extends { priority: Priority }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.priority.compareTo(b.priority));
}

/**
 * Get highest priority item from list
 */
export function getHighestPriority<T extends { priority: Priority }>(
  items: T[]
): T | null {
  if (items.length === 0) {
    return null;
  }
  const sorted = sortByPriority(items);
  return sorted[0] ?? null;
}

/**
 * Filter items by minimum priority level
 */
export function filterByMinPriority<T extends { priority: Priority }>(
  items: T[],
  minPriority: Priority
): T[] {
  return items.filter(
    (item) => item.priority.isHigherThan(minPriority) || item.priority.equals(minPriority)
  );
}

/**
 * Check if priority should be elevated based on age
 */
export function shouldElevatePriority(
  currentPriority: Priority,
  createdAt: Date,
  now: Date = new Date(),
  hoursThreshold: number = 24
): boolean {
  const ageInHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

  // Don't elevate P0 items
  if (currentPriority.equals(Priority.P0_CRITICAL)) {
    return false;
  }

  return ageInHours >= hoursThreshold;
}

/**
 * Get elevated priority (one level higher)
 */
export function elevatePriority(current: Priority): Priority {
  const currentLevel = current.toNumber();
  if (currentLevel === 0) {
    return current; // Already highest
  }
  return Priority.fromNumber((currentLevel - 1) as PriorityLevel);
}
