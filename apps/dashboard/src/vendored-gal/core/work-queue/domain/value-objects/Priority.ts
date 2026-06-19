/**
 * Priority Value Object
 *
 * Immutable value object representing work item priority.
 * Lower number = higher priority (P0 is most urgent)
 */

export type PriorityLevel = 0 | 1 | 2 | 3;

export class Priority {
  private constructor(private readonly value: PriorityLevel) {}

  static readonly P0_CRITICAL = new Priority(0);
  static readonly P1_HIGH = new Priority(1);
  static readonly P2_MEDIUM = new Priority(2);
  static readonly P3_STANDARD = new Priority(3);

  /**
   * Create Priority from numeric value
   */
  static fromNumber(value: number): Priority {
    if (!this.isValid(value)) {
      throw new Error(`Invalid priority value: ${value}. Must be 0, 1, 2, or 3`);
    }
    return new Priority(value as PriorityLevel);
  }

  /**
   * Create Priority from label names
   */
  static fromLabels(labels: string[], type: 'issue' | 'pr' = 'issue'): Priority {
    const labelNames = labels.map((l) => l.toLowerCase());

    // P0: Critical/Infrastructure blockers
    if (labelNames.some((l) => ['blocker', 'infrastructure', 'critical'].includes(l))) {
      return Priority.P0_CRITICAL;
    }

    // P1: Auto-approve eligible PRs only
    if (type === 'pr' && labelNames.some((l) => l === 'auto-approve-eligible')) {
      return Priority.P1_HIGH;
    }

    // P2: High-risk or blocked items
    if (labelNames.some((l) => l.startsWith('risk:high') || l.startsWith('sdlc:') && l.includes('blocked'))) {
      return Priority.P2_MEDIUM;
    }

    // P3: Standard work (bug, enhancement, feature)
    return Priority.P3_STANDARD;
  }

  /**
   * Check if value is valid priority
   */
  static isValid(value: number): value is PriorityLevel {
    return [0, 1, 2, 3].includes(value);
  }

  /**
   * Get numeric value
   */
  toNumber(): PriorityLevel {
    return this.value;
  }

  /**
   * Get human-readable label
   */
  toLabel(): string {
    const labels: Record<PriorityLevel, string> = {
      0: 'P0 - Critical',
      1: 'P1 - High',
      2: 'P2 - Medium',
      3: 'P3 - Standard',
    };
    return labels[this.value];
  }

  /**
   * Compare priorities (for sorting)
   * Returns negative if this is higher priority than other
   */
  compareTo(other: Priority): number {
    return this.value - other.value;
  }

  /**
   * Check if this priority is higher (more urgent) than other
   */
  isHigherThan(other: Priority): boolean {
    return this.value < other.value;
  }

  /**
   * Check equality
   */
  equals(other: Priority): boolean {
    return this.value === other.value;
  }
}
