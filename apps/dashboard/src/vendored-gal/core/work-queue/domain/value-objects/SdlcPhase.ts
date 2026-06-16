/**
 * SdlcPhase Value Object
 *
 * Immutable value object representing SDLC phase (1-7).
 * Encapsulates phase metadata and progression logic.
 */

export type PhaseNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;

interface PhaseMetadata {
  name: string;
  command: string;
  description: string;
}

const PHASE_METADATA: Record<PhaseNumber, PhaseMetadata> = {
  1: { name: 'specify', command: '/sdlc:1-specify:run', description: 'Create specification' },
  2: { name: 'design', command: '/sdlc:2-design:run', description: 'Design solution' },
  3: { name: 'test', command: '/sdlc:3-test:run', description: 'Write failing tests (TDD Red)' },
  4: { name: 'implement', command: '/sdlc:4-implement:run', description: 'Implement solution (TDD Green)' },
  5: {
    name: 'deploy-verify',
    command: '/sdlc:5-deploy-verify:run',
    description: 'Test locally before creating PR',
  },
  6: { name: 'review', command: '/sdlc:6-review:run', description: 'Code review' },
  7: { name: 'merge', command: '/sdlc:7-merge:run', description: 'Merge to main' },
};

const LEGACY_PHASE_NAME_ALIASES: Record<string, PhaseNumber> = {
  // Legacy names kept for backwards compatibility after phase rename/reorder.
  verify: 5,
  deploy: 7,
};

export class SdlcPhase {
  private constructor(private readonly value: PhaseNumber) {}

  static readonly SPECIFY = new SdlcPhase(1);
  static readonly DESIGN = new SdlcPhase(2);
  static readonly TEST = new SdlcPhase(3);
  static readonly IMPLEMENT = new SdlcPhase(4);
  static readonly DEPLOY_VERIFY = new SdlcPhase(5);
  static readonly REVIEW = new SdlcPhase(6);
  static readonly MERGE = new SdlcPhase(7);

  /**
   * Create phase from number
   */
  static fromNumber(value: number): SdlcPhase {
    if (!this.isValid(value)) {
      throw new Error(`Invalid SDLC phase: ${value}. Must be 1-7`);
    }
    return new SdlcPhase(value as PhaseNumber);
  }

  /**
   * Create phase from name
   */
  static fromName(name: string): SdlcPhase {
    const normalizedName = name.toLowerCase();

    const legacyAlias = LEGACY_PHASE_NAME_ALIASES[normalizedName];
    if (legacyAlias) {
      return new SdlcPhase(legacyAlias);
    }

    const entry = Object.entries(PHASE_METADATA).find(
      ([, meta]) => meta.name === normalizedName
    );
    if (!entry) {
      throw new Error(`Invalid SDLC phase name: ${name}`);
    }
    return new SdlcPhase(parseInt(entry[0]) as PhaseNumber);
  }

  /**
   * Check if value is valid phase number
   */
  static isValid(value: number): value is PhaseNumber {
    return [1, 2, 3, 4, 5, 6, 7].includes(value);
  }

  /**
   * Get all phases in order
   */
  static all(): SdlcPhase[] {
    return [
      SdlcPhase.SPECIFY,
      SdlcPhase.DESIGN,
      SdlcPhase.TEST,
      SdlcPhase.IMPLEMENT,
      SdlcPhase.DEPLOY_VERIFY,
      SdlcPhase.REVIEW,
      SdlcPhase.MERGE,
    ];
  }

  /**
   * Get phase number
   */
  toNumber(): PhaseNumber {
    return this.value;
  }

  /**
   * Get phase name
   */
  getName(): string {
    return PHASE_METADATA[this.value].name;
  }

  /**
   * Get command to execute this phase
   */
  getCommand(): string {
    return PHASE_METADATA[this.value].command;
  }

  /**
   * Get phase description
   */
  getDescription(): string {
    return PHASE_METADATA[this.value].description;
  }

  /**
   * Check if this is the first phase
   */
  isFirst(): boolean {
    return this.value === 1;
  }

  /**
   * Check if this is the last phase
   */
  isLast(): boolean {
    return this.value === 7;
  }

  /**
   * Get next phase (null if last)
   */
  next(): SdlcPhase | null {
    if (this.isLast()) {
      return null;
    }
    return new SdlcPhase((this.value + 1) as PhaseNumber);
  }

  /**
   * Get previous phase (null if first)
   */
  previous(): SdlcPhase | null {
    if (this.isFirst()) {
      return null;
    }
    return new SdlcPhase((this.value - 1) as PhaseNumber);
  }

  /**
   * Generate command for next phase with issue number
   */
  nextCommand(issueNumber: string | number): string | null {
    const nextPhase = this.next();
    if (!nextPhase) {
      return null;
    }
    return `${nextPhase.getCommand()} ${issueNumber}`;
  }

  /**
   * Check equality
   */
  equals(other: SdlcPhase): boolean {
    return this.value === other.value;
  }

  /**
   * Compare phases (for sorting)
   */
  compareTo(other: SdlcPhase): number {
    return this.value - other.value;
  }
}
