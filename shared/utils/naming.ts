import type { DataType, DatabaseProject } from '../types/schema';

/**
 * Helpers that were copy-pasted across the generators and parsers.
 *
 * Keeping four near-identical copies is what let the MikroORM and TypeORM
 * generators drift apart (audit GEN-19), so they live here now. Behaviour is
 * unchanged from the copies they replace — the golden-file snapshots in
 * test/generators.snapshot.test.ts pin that.
 */

/** `order_items` -> `OrderItems`. Was duplicated in typeorm/mikroorm/prisma. */
export function formatClassName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]/g, '_')
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/** `order_items` -> `orderItems`. Was private to the Drizzle generator. */
export function formatCamelCase(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]/g, '_')
    .split('_')
    .filter(Boolean)
    .map((part, idx) => (idx === 0 ? part.toLowerCase() : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('');
}

/** Was duplicated in the TypeORM and MikroORM generators. */
export function mapTsType(type: DataType): string {
  switch (type) {
    case 'INT':
    case 'BIGINT':
    case 'DECIMAL':
    case 'FLOAT':
      return 'number';
    case 'VARCHAR':
    case 'TEXT':
    case 'UUID':
    case 'ENUM':
      return 'string';
    case 'BOOLEAN':
      return 'boolean';
    case 'TIMESTAMP':
    case 'DATE':
      return 'Date';
    case 'JSON':
      return 'any';
    default:
      return 'string';
  }
}

/** Was duplicated in the TypeORM and MikroORM generators. */
export function getSchemaName(project: DatabaseProject, schemaId: string): string {
  return project.schemas.find(s => s.id === schemaId)?.name || 'public';
}

/**
 * Raw SQL type string -> DataType. Was duplicated as `mapSqlTypeToDataType`
 * in sqlParser.ts and `mapRawTypeToDataType` in the now-deleted sqlImporter.ts.
 *
 * Note the ordering bug this preserves: the `INT` test runs before `BIGINT`,
 * so `BIGINT` is classified as `INT`. Left as-is deliberately — fixing it is
 * audit phase 4 and would silently change parse output before the round-trip
 * harness can catch the regression.
 */
export function mapSqlTypeToDataType(rawType: string): DataType {
  if (rawType.includes('INT') || rawType.includes('SERIAL')) return 'INT';
  if (rawType.includes('BIGINT')) return 'BIGINT';
  if (rawType.includes('CHAR') || rawType.includes('VARCHAR')) return 'VARCHAR';
  if (rawType.includes('TEXT')) return 'TEXT';
  if (rawType.includes('BOOL')) return 'BOOLEAN';
  if (rawType.includes('UUID')) return 'UUID';
  if (rawType.includes('DECIMAL') || rawType.includes('NUMERIC')) return 'DECIMAL';
  if (rawType.includes('FLOAT') || rawType.includes('REAL') || rawType.includes('DOUBLE')) return 'FLOAT';
  if (rawType.includes('TIME') || rawType.includes('TIMESTAMP')) return 'TIMESTAMP';
  if (rawType.includes('DATE')) return 'DATE';
  if (rawType.includes('JSON')) return 'JSON';
  return 'VARCHAR';
}
