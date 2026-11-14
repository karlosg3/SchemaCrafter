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
 * Raw SQL type string -> DataType.
 *
 * Evaluates wider integer variants (`BIGINT`, `BIGSERIAL`, `INT8`) before
 * `INT`/`SERIAL`, and MySQL `TINYINT(1)` before `INT`.
 */
export function mapSqlTypeToDataType(rawType: string): DataType {
  const upper = rawType.toUpperCase();
  if (upper.includes('BIGINT') || upper.includes('BIGSERIAL') || upper === 'INT8') return 'BIGINT';
  if (upper.includes('TINYINT(1)') || upper.includes('BOOL')) return 'BOOLEAN';
  if (upper.includes('INT') || upper.includes('SERIAL')) return 'INT';
  if (upper.includes('CHAR') || upper.includes('VARCHAR')) return 'VARCHAR';
  if (upper.includes('TEXT')) return 'TEXT';
  if (upper.includes('UUID')) return 'UUID';
  if (upper.includes('DECIMAL') || upper.includes('NUMERIC')) return 'DECIMAL';
  if (upper.includes('FLOAT') || upper.includes('REAL') || upper.includes('DOUBLE')) return 'FLOAT';
  if (upper.includes('TIME') || upper.includes('TIMESTAMP')) return 'TIMESTAMP';
  if (upper.includes('DATE')) return 'DATE';
  if (upper.includes('JSON')) return 'JSON';
  return 'VARCHAR';
}
