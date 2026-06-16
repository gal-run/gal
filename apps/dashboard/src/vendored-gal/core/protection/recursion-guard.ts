/**
 * Agent Recursion Protection - Prevent Runaway Loops
 *
 * GAL-12: Detects and prevents infinite recursion in AI agent operations
 *
 * Features:
 * - Call stack depth monitoring
 * - Loop detection via fingerprinting
 * - Automatic circuit breaker
 * - Resource usage tracking
 */

export interface RecursionConfig {
  maxDepth: number;
  maxIterations: number;
  maxDuration: number; // milliseconds
  fingerprint: {
    enabled: boolean;
    windowSize: number;
    similarityThreshold: number;
  };
  circuitBreaker: {
    enabled: boolean;
    tripThreshold: number;
    resetTimeout: number; // milliseconds
  };
}

export interface CallContext {
  id: string;
  parentId?: string;
  depth: number;
  operation: string;
  args: string[];
  fingerprint: string;
  timestamp: number;
}

export interface RecursionMetrics {
  currentDepth: number;
  maxDepthReached: number;
  totalCalls: number;
  loopsDetected: number;
  circuitBreakerTrips: number;
  startTime: number;
  elapsedTime: number;
}

export interface RecursionViolation {
  type: 'max_depth' | 'loop_detected' | 'max_iterations' | 'timeout' | 'circuit_breaker';
  message: string;
  context: CallContext;
  metrics: RecursionMetrics;
}

const DEFAULT_CONFIG: RecursionConfig = {
  maxDepth: 10,
  maxIterations: 100,
  maxDuration: 300000, // 5 minutes
  fingerprint: {
    enabled: true,
    windowSize: 5,
    similarityThreshold: 0.9,
  },
  circuitBreaker: {
    enabled: true,
    tripThreshold: 3,
    resetTimeout: 60000, // 1 minute
  },
};

/**
 * Recursion Guard - Protects against runaway agent loops
 */
export class RecursionGuard {
  private config: RecursionConfig;
  private callStack: CallContext[] = [];
  private recentFingerprints: string[] = [];
  private metrics: RecursionMetrics;
  private circuitBreakerTrips: number = 0;
  private circuitBreakerOpen: boolean = false;
  private circuitBreakerOpenTime: number = 0;
  private violations: RecursionViolation[] = [];

  constructor(config: Partial<RecursionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metrics = this.initMetrics();
  }

  private initMetrics(): RecursionMetrics {
    return {
      currentDepth: 0,
      maxDepthReached: 0,
      totalCalls: 0,
      loopsDetected: 0,
      circuitBreakerTrips: 0,
      startTime: Date.now(),
      elapsedTime: 0,
    };
  }

  /**
   * Enter a new operation (push to call stack)
   */
  enter(operation: string, args: string[] = [], parentId?: string): CallContext {
    // Update metrics
    this.metrics.totalCalls++;
    this.metrics.currentDepth++;
    this.metrics.elapsedTime = Date.now() - this.metrics.startTime;

    if (this.metrics.currentDepth > this.metrics.maxDepthReached) {
      this.metrics.maxDepthReached = this.metrics.currentDepth;
    }

    // Create call context
    const context: CallContext = {
      id: this.generateId(),
      parentId,
      depth: this.metrics.currentDepth,
      operation,
      args,
      fingerprint: this.generateFingerprint(operation, args),
      timestamp: Date.now(),
    };

    // Check for violations before adding to stack
    const violation = this.checkViolations(context);
    if (violation) {
      this.violations.push(violation);
      throw new RecursionError(violation);
    }

    // Add to call stack and fingerprint history
    this.callStack.push(context);
    this.recentFingerprints.push(context.fingerprint);

    // Trim fingerprint window
    if (this.recentFingerprints.length > this.config.fingerprint.windowSize * 2) {
      this.recentFingerprints = this.recentFingerprints.slice(-this.config.fingerprint.windowSize);
    }

    return context;
  }

  /**
   * Exit an operation (pop from call stack)
   */
  exit(contextId: string): void {
    const index = this.callStack.findIndex(c => c.id === contextId);
    if (index !== -1) {
      this.callStack.splice(index, 1);
      this.metrics.currentDepth = this.callStack.length;
    }
  }

  /**
   * Check for recursion violations
   */
  private checkViolations(context: CallContext): RecursionViolation | null {
    // Check circuit breaker
    if (this.circuitBreakerOpen) {
      const timeSinceOpen = Date.now() - this.circuitBreakerOpenTime;
      if (timeSinceOpen < this.config.circuitBreaker.resetTimeout) {
        return {
          type: 'circuit_breaker',
          message: `Circuit breaker is open. Resets in ${Math.ceil((this.config.circuitBreaker.resetTimeout - timeSinceOpen) / 1000)}s`,
          context,
          metrics: { ...this.metrics },
        };
      }
      // Reset circuit breaker
      this.circuitBreakerOpen = false;
      this.circuitBreakerTrips = 0;
    }

    // Check max depth
    if (context.depth > this.config.maxDepth) {
      this.tripCircuitBreaker();
      return {
        type: 'max_depth',
        message: `Maximum recursion depth (${this.config.maxDepth}) exceeded`,
        context,
        metrics: { ...this.metrics },
      };
    }

    // Check max iterations
    if (this.metrics.totalCalls > this.config.maxIterations) {
      this.tripCircuitBreaker();
      return {
        type: 'max_iterations',
        message: `Maximum iterations (${this.config.maxIterations}) exceeded`,
        context,
        metrics: { ...this.metrics },
      };
    }

    // Check timeout
    if (this.metrics.elapsedTime > this.config.maxDuration) {
      this.tripCircuitBreaker();
      return {
        type: 'timeout',
        message: `Maximum duration (${this.config.maxDuration}ms) exceeded`,
        context,
        metrics: { ...this.metrics },
      };
    }

    // Check for loop patterns
    if (this.config.fingerprint.enabled && this.detectLoop(context.fingerprint)) {
      this.metrics.loopsDetected++;
      this.tripCircuitBreaker();
      return {
        type: 'loop_detected',
        message: 'Repeating operation pattern detected - possible infinite loop',
        context,
        metrics: { ...this.metrics },
      };
    }

    return null;
  }

  /**
   * Detect loop patterns via fingerprinting
   */
  private detectLoop(fingerprint: string): boolean {
    if (this.recentFingerprints.length < this.config.fingerprint.windowSize) {
      return false;
    }

    const window = this.recentFingerprints.slice(-this.config.fingerprint.windowSize);
    const matchCount = window.filter(fp => this.similarity(fp, fingerprint) >= this.config.fingerprint.similarityThreshold).length;

    // If most recent operations are similar, it's likely a loop
    return matchCount >= this.config.fingerprint.windowSize - 1;
  }

  /**
   * Calculate similarity between two fingerprints
   */
  private similarity(fp1: string, fp2: string): number {
    if (fp1 === fp2) return 1;
    if (fp1.length === 0 || fp2.length === 0) return 0;

    // Simple Jaccard similarity on tokens
    const tokens1 = new Set(fp1.split(':'));
    const tokens2 = new Set(fp2.split(':'));
    const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
    const union = new Set([...tokens1, ...tokens2]);

    return intersection.size / union.size;
  }

  /**
   * Trip the circuit breaker
   */
  private tripCircuitBreaker(): void {
    if (!this.config.circuitBreaker.enabled) return;

    this.circuitBreakerTrips++;
    this.metrics.circuitBreakerTrips++;

    if (this.circuitBreakerTrips >= this.config.circuitBreaker.tripThreshold) {
      this.circuitBreakerOpen = true;
      this.circuitBreakerOpenTime = Date.now();
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Generate operation fingerprint
   */
  private generateFingerprint(operation: string, args: string[]): string {
    const normalized = [operation, ...args.slice(0, 3)].join(':').toLowerCase();
    return normalized;
  }

  /**
   * Get current metrics
   */
  getMetrics(): RecursionMetrics {
    return {
      ...this.metrics,
      elapsedTime: Date.now() - this.metrics.startTime,
    };
  }

  /**
   * Get all violations
   */
  getViolations(): RecursionViolation[] {
    return [...this.violations];
  }

  /**
   * Get current call stack
   */
  getCallStack(): CallContext[] {
    return [...this.callStack];
  }

  /**
   * Reset guard state
   */
  reset(): void {
    this.callStack = [];
    this.recentFingerprints = [];
    this.metrics = this.initMetrics();
    this.circuitBreakerTrips = 0;
    this.circuitBreakerOpen = false;
    this.violations = [];
  }

  /**
   * Create a wrapped function with recursion protection
   */
  wrap<T extends (...args: any[]) => any>(
    fn: T,
    operation: string
  ): (...args: Parameters<T>) => ReturnType<T> {
    return (...args: Parameters<T>): ReturnType<T> => {
      const context = this.enter(operation, args.map(String));
      try {
        return fn(...args);
      } finally {
        this.exit(context.id);
      }
    };
  }

  /**
   * Create an async wrapped function with recursion protection
   */
  wrapAsync<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    operation: string
  ): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>> {
    return async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
      const context = this.enter(operation, args.map(String));
      try {
        return await fn(...args);
      } finally {
        this.exit(context.id);
      }
    };
  }
}

/**
 * Recursion Error
 */
export class RecursionError extends Error {
  public readonly violation: RecursionViolation;

  constructor(violation: RecursionViolation) {
    super(violation.message);
    this.name = 'RecursionError';
    this.violation = violation;
  }
}

/**
 * Global guard instance
 */
let globalGuard: RecursionGuard | null = null;

export function getRecursionGuard(config?: Partial<RecursionConfig>): RecursionGuard {
  if (!globalGuard) {
    globalGuard = new RecursionGuard(config);
  }
  return globalGuard;
}

export function resetGlobalGuard(): void {
  if (globalGuard) {
    globalGuard.reset();
  }
  globalGuard = null;
}

export default RecursionGuard;
