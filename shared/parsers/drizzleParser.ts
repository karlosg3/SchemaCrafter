import type { Table, Column, DataType, DatabaseProject } from '../types/schema';

export function parseDrizzleToProject(codeText: string, currentProject: DatabaseProject): DatabaseProject {
  const tables: Table[] = [];
  
  // Match `export const tableName = pgTable('table_name', { ... });`
  const tableRegex = /export\s+const\s+(\w+)\s*=\s*(?:pgTable|mysqlTable|sqliteTable)\s*\(\s*['"](\w+)['"]\s*,\s*\{([\s\S]*?)\}\s*\);/g;

  let match: RegExpExecArray | null;
  let x = 80;
  let y = 80;

  while ((match = tableRegex.exec(codeText)) !== null) {
    // Groups 2 and 3 are non-optional in tableRegex, so both are present here.
    const tableName = match[2]!;
    const body = match[3]!;

    const columns: Column[] = [];
    const lines = body.split('\n');

    let colIndex = 1;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//')) continue;

      const parts = line.split(':');
      if (parts.length < 2) continue;

      // Both indexes are guaranteed by the `parts.length < 2` guard above.
      const colName = parts[0]!.trim();
      const rightHand = parts[1]!.trim();

      const typeMatch = /^(serial|varchar|text|integer|boolean|timestamp|decimal|json|real)/.exec(rightHand);
      const drizzleType = typeMatch?.[1] ?? 'text';

      const type: DataType = mapDrizzleTypeToDataType(drizzleType);
      const isPrimaryKey = rightHand.includes('.primaryKey()');
      const isNullable = !rightHand.includes('.notNull()') && !isPrimaryKey;
      const isUnique = rightHand.includes('.unique()');

      columns.push({
        id: `${tableName}-col-${colIndex++}`,
        name: colName,
        type,
        isPrimaryKey,
        isNullable: isPrimaryKey ? false : isNullable,
        isUnique
      });
    }

    tables.push({
      id: `table-${tableName.toLowerCase()}`,
      name: tableName.toLowerCase(),
      schemaId: currentProject.schemas[0]?.id,
      position: { x, y },
      color: '#10b981',
      columns
    });

    x += 380;
    if (x > 1100) {
      x = 80;
      y += 340;
    }
  }

  // Preserve positions of existing tables
  const existingMap = new Map<string, Table>();
  currentProject.tables.forEach((t) => existingMap.set(t.name, t));

  const mergedTables = tables.map((t) => {
    const existing = existingMap.get(t.name);
    if (existing) {
      return { ...t, position: existing.position, color: existing.color, schemaId: existing.schemaId };
    }
    return t;
  });

  return {
    ...currentProject,
    tables: mergedTables.length > 0 ? mergedTables : currentProject.tables
  };
}

function mapDrizzleTypeToDataType(rawType: string): DataType {
  switch (rawType) {
    case 'serial':
    case 'integer': return 'INT';
    case 'varchar': return 'VARCHAR';
    case 'text': return 'TEXT';
    case 'boolean': return 'BOOLEAN';
    case 'timestamp': return 'TIMESTAMP';
    case 'decimal': return 'DECIMAL';
    case 'real': return 'FLOAT';
    case 'json': return 'JSON';
    default: return 'VARCHAR';
  }
}
