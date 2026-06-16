/**
 * Convenience Model Telemetry
 *
 * Helper functions for emitting telemetry events from model-assisted convenience features:
 * - Auto-Discovery
 * - Approved Config Generation
 * - Config Sync
 *
 * This module provides structured event emission for the training/eval data loop.
 * All events include request context, model output, validation results, fallback info,
 * and final outcomes for KPI tracking.
 *
 * Design principles:
 * - Privacy-first: No PII, redacted context
 * - Training-ready: Structured for model fine-tuning
 * - KPI-driven: Includes metrics for promotion gates
 * - Experiment-aware: Tracks shadow/enforce rollout mode
 */

import type {
  EnhancedTelemetryEvent,
  ConvenienceModelEventAttributes,
  TelemetryEventType,
} from '@gal/types';

function generateEventId(): string {
  const cryptoObj = globalThis as typeof globalThis & {
    crypto?: { randomUUID?: () => string }
  };
  if (cryptoObj.crypto?.randomUUID) {
    return cryptoObj.crypto.randomUUID();
  }

  // Fallback for runtimes without Web Crypto randomUUID
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Feature types for convenience model events
 */
export type ConvenienceFeatureType = 'discovery' | 'approved_config' | 'sync';

/**
 * Rollout mode for convenience features
 */
export type RolloutMode = 'shadow' | 'enforce';

/**
 * Base context for all convenience model events
 */
export interface ConvenienceModelContext {
  /** Feature type */
  featureType: ConvenienceFeatureType;
  /** Organization ID (for approved config/sync) */
  organizationId?: string;
  /** Platform being discovered/configured */
  platform?: string;
  /** Client surface where model call originated */
  clientSurface?:
    | 'api'
    | 'cli'
    | 'dashboard'
    | 'vscode_extension'
    | 'chrome_extension'
    | 'mcp_session'
    | 'background_agent';
  /** Rollout mode */
  rolloutMode?: RolloutMode;
  /** Experiment ID (optional) */
  experimentId?: string;
}

/**
 * Model request information
 */
export interface ModelRequestInfo {
  /** Request parameters hash (for deduplication) */
  requestHash: string;
  /** Number of repos in scope */
  repoCount?: number;
  /** Timestamp of request */
  timestamp: string;
}

/**
 * Model output information
 */
export interface ModelOutputInfo {
  /** Whether output is valid JSON */
  isValidJson: boolean;
  /** Model used */
  modelName: string;
  /** Token count */
  tokenCount?: number;
  /** Latency in milliseconds */
  latencyMs: number;
  /** Output hash (for content analysis) */
  outputHash: string;
}

/**
 * Validation result information
 */
export interface ValidationResultInfo {
  /** Whether validation passed */
  passed: boolean;
  /** Validation error types (redacted) */
  errorTypes?: string[];
  /** Validator name */
  validator: string;
}

/**
 * Policy check result information
 */
export interface PolicyResultInfo {
  /** Whether policy check passed */
  passed: boolean;
  /** Policy violation types (redacted) */
  violationTypes?: string[];
  /** Policy name */
  policyName: string;
}

/**
 * Fallback information
 */
export interface FallbackInfo {
  /** Whether fallback was triggered */
  triggered: boolean;
  /** Fallback reason */
  reason?: 'validation_failure' | 'timeout' | 'model_error' | 'rate_limit' | 'policy_violation';
  /** Fallback strategy used */
  strategy?: 'static_default' | 'cached_response' | 'degraded_mode' | 'manual_override';
}

/**
 * Outcome information
 */
export interface OutcomeInfo {
  /** Whether the operation succeeded for the user */
  userSuccess: boolean;
  /** Business metric proxy */
  metric: string;
  /** Metric value */
  metricValue: number;
  /** User feedback (if available) */
  userRating?: number;
}

/**
 * Helper class for emitting convenience model telemetry events
 */
export class ConvenienceModelTelemetry {
  private serviceVersion: string;
  private serviceName: 'gal-cli' | 'gal-run-api';

  constructor(serviceName: 'gal-cli' | 'gal-run-api', serviceVersion: string) {
    this.serviceName = serviceName;
    this.serviceVersion = serviceVersion;
  }

  /**
   * Emit a model request event
   */
  emitModelRequest(
    context: ConvenienceModelContext,
    requestInfo: ModelRequestInfo
  ): EnhancedTelemetryEvent {
    const eventType: TelemetryEventType = this.getEventType(context.featureType);

    const attributes: ConvenienceModelEventAttributes = {
      feature_type: context.featureType,
      request_context: {
        ...(context.organizationId && { organization_id: context.organizationId }),
        ...(context.platform && { platform: context.platform }),
        ...(context.clientSurface && { client_surface: context.clientSurface }),
        ...(requestInfo.repoCount !== undefined && { repo_count: requestInfo.repoCount }),
        request_hash: requestInfo.requestHash,
      },
      ...(context.rolloutMode || context.experimentId ? {
        experiment: {
          ...(context.rolloutMode && { mode: context.rolloutMode }),
          ...(context.experimentId && { experiment_id: context.experimentId }),
        },
      } : {}),
    };

    return this.createEvent(eventType, attributes);
  }

  /**
   * Emit a model validation event
   */
  emitValidation(
    context: ConvenienceModelContext,
    modelOutput: ModelOutputInfo,
    validation: ValidationResultInfo
  ): EnhancedTelemetryEvent {
    const attributes: ConvenienceModelEventAttributes = {
      feature_type: context.featureType,
      model_output: {
        is_valid_json: modelOutput.isValidJson,
        model_name: modelOutput.modelName,
        ...(modelOutput.tokenCount !== undefined && { token_count: modelOutput.tokenCount }),
        latency_ms: modelOutput.latencyMs,
        output_hash: modelOutput.outputHash,
      },
      validation: {
        passed: validation.passed,
        ...(validation.errorTypes !== undefined && { error_types: validation.errorTypes }),
        validator: validation.validator,
      },
      ...(context.rolloutMode || context.experimentId ? {
        experiment: {
          ...(context.rolloutMode && { mode: context.rolloutMode }),
          ...(context.experimentId && { experiment_id: context.experimentId }),
        },
      } : {}),
    };

    return this.createEvent('model.validation', attributes);
  }

  /**
   * Emit a fallback event
   */
  emitFallback(
    context: ConvenienceModelContext,
    fallback: FallbackInfo
  ): EnhancedTelemetryEvent {
    const attributes: ConvenienceModelEventAttributes = {
      feature_type: context.featureType,
      fallback: {
        triggered: fallback.triggered,
        ...(fallback.reason && { reason: fallback.reason }),
        ...(fallback.strategy && { strategy: fallback.strategy }),
      },
      ...(context.rolloutMode || context.experimentId ? {
        experiment: {
          ...(context.rolloutMode && { mode: context.rolloutMode }),
          ...(context.experimentId && { experiment_id: context.experimentId }),
        },
      } : {}),
    };

    return this.createEvent('model.fallback', attributes);
  }

  /**
   * Emit an outcome event
   */
  emitOutcome(
    context: ConvenienceModelContext,
    outcome: OutcomeInfo,
    policy?: PolicyResultInfo
  ): EnhancedTelemetryEvent {
    const attributes: ConvenienceModelEventAttributes = {
      feature_type: context.featureType,
      outcome: {
        user_success: outcome.userSuccess,
        metric: outcome.metric,
        metric_value: outcome.metricValue,
        ...(outcome.userRating !== undefined && { user_rating: outcome.userRating }),
      },
      ...(policy ? {
        policy: {
          passed: policy.passed,
          ...(policy.violationTypes !== undefined && { violation_types: policy.violationTypes }),
          policy_name: policy.policyName,
        },
      } : {}),
      ...(context.rolloutMode || context.experimentId ? {
        experiment: {
          ...(context.rolloutMode && { mode: context.rolloutMode }),
          ...(context.experimentId && { experiment_id: context.experimentId }),
        },
      } : {}),
    };

    return this.createEvent('model.outcome', attributes);
  }

  /**
   * Get event type for a feature and stage
   */
  private getEventType(feature: ConvenienceFeatureType): TelemetryEventType {
    switch (feature) {
      case 'discovery':
        return 'model.discovery_request';
      case 'approved_config':
        return 'model.approved_config_request';
      case 'sync':
        return 'model.sync_request';
    }
  }

  /**
   * Create a base telemetry event
   */
  private createEvent(
    eventType: TelemetryEventType,
    attributes: ConvenienceModelEventAttributes
  ): EnhancedTelemetryEvent {
    return {
      id: generateEventId(),
      timestamp: new Date().toISOString(),
      severity: 'INFO',
      resource: {
        'service.name': this.serviceName,
        'service.version': this.serviceVersion,
        'host.os': process.platform as 'darwin' | 'linux' | 'win32',
        'host.arch': process.arch as 'x64' | 'arm64' | 'ia32',
        'process.runtime.version': process.version,
      },
      eventType,
      attributes: attributes as Record<string, string | number | boolean | null>,
      installationId: 'server', // Server-side events use fixed installation ID
    };
  }
}

/**
 * Create a convenience model telemetry instance
 */
export function createConvenienceModelTelemetry(
  serviceName: 'gal-cli' | 'gal-run-api',
  serviceVersion: string
): ConvenienceModelTelemetry {
  return new ConvenienceModelTelemetry(serviceName, serviceVersion);
}
