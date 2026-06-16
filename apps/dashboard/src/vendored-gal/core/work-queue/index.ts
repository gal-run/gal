/**
 * Work Queue - Clean Architecture
 *
 * This module provides work item management for AI agents using Clean Architecture.
 *
 * Layers (dependencies point inward):
 * - Domain: Entities, Value Objects, Business Rules (no dependencies)
 * - Use Cases: Application business rules (depends on Domain)
 * - Repositories: Interfaces/Ports (depends on Domain)
 *
 * External adapters (Firestore, Express routes) are in apps/api.
 */

// Domain Layer
export * from './domain';

// Use Cases Layer
export * from './use-cases';

// Repository Interfaces (Ports)
export * from './repositories';
