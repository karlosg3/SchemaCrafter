import type { Table, Column, DataType, DatabaseProject, SchemaGroup } from '../types/schema';
import { mapSqlTypeToDataType } from '../utils/naming';

export function parseSqlToProject(codeText: string, currentProject: DatabaseProject): DatabaseProject {
  const tables: Table[] = [];
  const schemasMap = new Map<string, SchemaGroup>();
  currentProject.schemas.forEach((s) => schemasMap.set(s.name, s));

  // Extract `CREATE SCHEMA` statements
  const schemaRegex = /CREATE\s+SCHEMA\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?/gim;
  let schemaMatch: RegExpExecArray | null;
  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
  let colorIdx = currentProject.schemas.length;

  while ((schemaMatch = schemaRegex.exec(codeText)) !== null) {
    // Group 1 is a non-optional (\w+), so it is present whenever the regex matched.
    const sName = schemaMatch[1]!.toLowerCase();
    if (!schemasMap.has(sName)) {
      schemasMap.set(sName, {
        id: `schema-${sName}-${Date.now()}`,
        name: sName,
        color: colors[colorIdx++ % colors.length]!
      });
    }
  }

  // Clean comments
  const cleanSql = codeText
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[`"']?(\w+)[`"']?\.)?[`"']?(\w+)[`"']?\s*\(([\s\S]*?)\)?;?/gim;

  let match: RegExpExecArray | null;
  let x = 80;
  let y = 80;

  while ((match = createTableRegex.exec(cleanSql)) !== null) {
    const rawSchema = match[1]?.toLowerCase();
    const rawTableName = match[2]!;
    const tableName = rawTableName.toLowerCase();
    const body = match[3] || '';

    let schemaId = currentProject.schemas[0]?.id;
    if (rawSchema) {
      if (!schemasMap.has(rawSchema)) {
        schemasMap.set(rawSchema, {
          id: `schema-${rawSchema}-${Date.now()}`,
          name: rawSchema,
          color: colors[colorIdx++ % colors.length]!
        });
      }
      schemaId = schemasMap.get(rawSchema)?.id || currentProject.schemas[0]?.id;
    }

    const columns: Column[] = [];
    const rawLines = body.split(',\n');

    let colIndex = 1;
    for (const rawLine of rawLines) {
      const line = rawLine.trim();
      if (
        !line ||
        line.toUpperCase().startsWith('CONSTRAINT') ||
        line.toUpperCase().startsWith('PRIMARY KEY') ||
        line.toUpperCase().startsWith('FOREIGN KEY')
      ) {
        continue;
      }

      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;

      // Both indexes are guaranteed by the `parts.length < 2` guard above.
      const colName = parts[0]!.replace(/[`"']/g, '');
      const typeRaw = parts[1]!.toUpperCase().replace(/\(\d+\)/g, '');

      const type: DataType = mapSqlTypeToDataType(typeRaw);
      const isPrimaryKey = line.toUpperCase().includes('PRIMARY KEY');
      const isNullable = !line.toUpperCase().includes('NOT NULL') && !isPrimaryKey;
      const isUnique = line.toUpperCase().includes('UNIQUE');
      const isAutoIncrement =
        line.toUpperCase().includes('AUTOINCREMENT') ||
        line.toUpperCase().includes('AUTO_INCREMENT') ||
        line.toUpperCase().includes('SERIAL');

      columns.push({
        id: `${tableName}-col-${colIndex++}`,
        name: colName,
        type,
        isPrimaryKey,
        isNullable: isPrimaryKey ? false : isNullable,
        isUnique,
        isAutoIncrement
      });
    }

    if (columns.length === 0) {
      columns.push({
        id: `${tableName}-id`,
        name: 'id',
        type: 'UUID',
        isPrimaryKey: true,
        isNullable: false,
        isUnique: true
      });
    }

    tables.push({
      id: `table-${tableName}`,
      name: tableName,
      schemaId,
      position: { x, y },
      color: schemasMap.get(rawSchema || '')?.color || '#6366f1',
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
      return { ...t, position: existing.position, color: existing.color };
    }
    return t;
  });

  return {
    ...currentProject,
    schemas: Array.from(schemasMap.values()),
    tables: mergedTables
  };
}

