/**
 * MigrationRegistry — lazy schema migration for Firestore documents.
 *
 * Each repository calls registry.migrate(collectionName, data) when reading
 * a document. If the document's _schemaVersion is below the current version,
 * the registry runs the registered migration functions in sequence and returns
 * the upgraded document.
 *
 * Repositories should fire-and-forget write the upgraded document back to Firestore
 * so the migration propagates gradually without a blocking backfill.
 */
type MigrationFn = (data: Record<string, unknown>) => Record<string, unknown>;

export class MigrationRegistry {
  private readonly migrations = new Map<string, MigrationFn>();

  /**
   * Register a migration for a collection from a specific version.
   * The migration function receives the document data and returns the upgraded data.
   * It MUST increment _schemaVersion on the returned data.
   */
  register(collection: string, fromVersion: number, fn: MigrationFn): void {
    this.migrations.set(`${collection}:${fromVersion}`, fn);
  }

  /**
   * Apply all registered migrations for the given collection starting from
   * the document's current _schemaVersion.
   */
  migrate(collection: string, data: Record<string, unknown>): Record<string, unknown> {
    let d = { ...data };
    let version = (d['_schemaVersion'] as number) ?? 1;
    while (this.migrations.has(`${collection}:${version}`)) {
      d = this.migrations.get(`${collection}:${version}`)!(d);
      version = (d['_schemaVersion'] as number) ?? version + 1;
    }
    return d;
  }

  /**
   * Returns true if the document needs migration (i.e., there is a registered
   * migration for its current version).
   */
  needsMigration(collection: string, data: Record<string, unknown>): boolean {
    const version = (data['_schemaVersion'] as number) ?? 1;
    return this.migrations.has(`${collection}:${version}`);
  }
}
