import type { Table, Column, DataType, DatabaseProject, EnumDefinition } from '../types/schema';
import { createId } from '../utils/ids';

export function parsePrismaToProject(codeText: string, currentProject: DatabaseProject): DatabaseProject {
  // 1. Parse `enum EnumName { val1 val2 ... }`
  const enums: EnumDefinition[] = [];
  const enumRegex = /enum\s+(\w+)\s*\{([\s\S]*?)\}/g;

  let enumMatch: RegExpExecArray | null;
  const enumX = 1250;
  let enumY = 80;

  while ((enumMatch = enumRegex.exec(codeText)) !== null) {
    // Groups 1 and 2 are non-optional in enumRegex.
    const enumName = enumMatch[1]!;
    const body = enumMatch[2]!;

    const values = body
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('//'));

    enums.push({
      id: createId(`enum-${enumName.toLowerCase()}`),
      name: enumName,
      values,
      position: { x: enumX, y: enumY }
    });

    enumY += 280;
  }

  // 2. Parse `model ModelName { ... }`
  const tables: Table[] = [];
  const modelRegex = /model\s+(\w+)\s*\{([^}]*)\}?/gi;

  let match: RegExpExecArray | null;
  let x = 80;
  let y = 80;

  while ((match = modelRegex.exec(codeText)) !== null) {
    const rawModelName = match[1]!;
    const tableName = rawModelName.toLowerCase();
    const body = match[2] || '';

    const columns: Column[] = [];
    const lines = body.split('\n');

    let colIndex = 1;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue;

      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;

      // Both indexes are guaranteed by the `parts.length < 2` guard above.
      const colName = parts[0]!;
      const prismaTypeRaw = parts[1]!.replace('?', '');

      // Skip relational array field declarations
      if (/^[A-Z]/.test(prismaTypeRaw) && !line.includes('@relation') && prismaTypeRaw.endsWith('[]')) {
        continue;
      }

      const matchingEnum = enums.find((e) => e.name === prismaTypeRaw) || (currentProject.enums || []).find((e) => e.name === prismaTypeRaw);
      const isEnumField = Boolean(matchingEnum);

      const type: DataType = isEnumField ? 'ENUM' : mapPrismaTypeToDataType(prismaTypeRaw);
      const varcharMatch = type === 'VARCHAR' ? /@db\.VarChar\s*\(\s*(\d+)\s*\)/i.exec(line) : null;
      const decimalMatch = type === 'DECIMAL' ? /@db\.Decimal\s*\(\s*(\d+)(?:\s*,\s*(\d+))?\s*\)/i.exec(line) : null;
      const parsedLength = varcharMatch?.[1] ? Number.parseInt(varcharMatch[1], 10) : undefined;
      const parsedPrecision = decimalMatch?.[1] ? Number.parseInt(decimalMatch[1], 10) : undefined;
      const parsedScale = decimalMatch?.[2] !== undefined ? Number.parseInt(decimalMatch[2], 10) : undefined;
      const isPrimaryKey = line.includes('@id');
      const isNullable = parts[1]!.endsWith('?');
      const isUnique = line.includes('@unique');

      let defaultValue: string | undefined = undefined;
      const defaultMatch = /@default\(([^)]+)\)/.exec(line);
      if (defaultMatch) {
        defaultValue = defaultMatch[1]!.replace(/["']/g, '');
      }

      columns.push({
        id: `${tableName}-col-${colIndex++}`,
        name: colName,
        type,
        ...(parsedLength !== undefined && parsedLength > 0 ? { length: parsedLength } : {}),
        ...(parsedPrecision !== undefined && parsedPrecision > 0 ? { precision: parsedPrecision } : {}),
        ...(parsedScale !== undefined && parsedScale >= 0 ? { scale: parsedScale } : {}),
        enumName: isEnumField ? prismaTypeRaw : undefined,
        isPrimaryKey,
        isNullable: isPrimaryKey ? false : isNullable,
        isUnique,
        defaultValue
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
      schemaId: currentProject.schemas[0]?.id,
      position: { x, y },
      color: '#6366f1',
      columns
    });

    x += 380;
    if (x > 1100) {
      x = 80;
      y += 340;
    }
  }

  // Preserve positions of existing tables & enums
  const existingMap = new Map<string, Table>();
  currentProject.tables.forEach((t) => existingMap.set(t.name, t));

  const mergedTables = tables.map((t) => {
    const existing = existingMap.get(t.name);
    if (existing) {
      return { ...t, position: existing.position, color: existing.color, schemaId: existing.schemaId };
    }
    return t;
  });

  const existingEnumMap = new Map<string, EnumDefinition>();
  (currentProject.enums || []).forEach((e) => existingEnumMap.set(e.name, e));

  const mergedEnums = enums.map((e) => {
    const existing = existingEnumMap.get(e.name);
    if (existing) {
      return { ...e, position: existing.position };
    }
    return e;
  });

  return {
    ...currentProject,
    enums: mergedEnums.length > 0 ? mergedEnums : (currentProject.enums || []),
    tables: mergedTables.length > 0 ? mergedTables : currentProject.tables
  };
}

function mapPrismaTypeToDataType(rawType: string): DataType {
  switch (rawType) {
    case 'Int': return 'INT';
    case 'BigInt': return 'BIGINT';
    case 'String': return 'VARCHAR';
    case 'Boolean': return 'BOOLEAN';
    case 'Float': return 'FLOAT';
    case 'Decimal': return 'DECIMAL';
    case 'DateTime': return 'TIMESTAMP';
    case 'Json': return 'JSON';
    default: return 'VARCHAR';
  }
}
