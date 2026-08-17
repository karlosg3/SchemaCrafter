import type { Table, Column, DataType, DatabaseProject, SchemaGroup, EnumDefinition } from '../types/schema';

export function parseMikroOrmToProject(codeText: string, currentProject: DatabaseProject): DatabaseProject {
  const schemasMap = new Map<string, SchemaGroup>();
  currentProject.schemas.forEach((s) => schemasMap.set(s.name, s));

  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6'];
  let colorIdx = currentProject.schemas.length;

  // 1. Parse `export enum EnumName { ... }`
  const enums: EnumDefinition[] = [];
  const enumRegex = /export\s+enum\s+(\w+)\s*\{([\s\S]*?)\}/g;

  let enumMatch: RegExpExecArray | null;
  const enumX = 1250;
  let enumY = 80;

  while ((enumMatch = enumRegex.exec(codeText)) !== null) {
    // Groups 1 and 2 are non-optional in enumRegex.
    const enumName = enumMatch[1]!;
    const body = enumMatch[2]!;

    const values: string[] = [];
    const lines = body.split('\n');

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//')) continue;

      const valMatch = /(\w+)\s*=\s*['"]([^'"]+)['"]/.exec(line);
      if (valMatch) {
        values.push(valMatch[2]!);
      } else {
        const simpleMatch = /^(\w+),?$/.exec(line);
        if (simpleMatch) {
          values.push(simpleMatch[1]!);
        }
      }
    }

    enums.push({
      id: `enum-${enumName.toLowerCase()}-${Date.now()}`,
      name: enumName,
      values,
      position: { x: enumX, y: enumY }
    });

    enumY += 280;
  }

  // 2. Parse `@Entity(...) export class ClassName { ... }`
  const tables: Table[] = [];
  const entityRegex = /@Entity\s*\(\s*(?:\{([\s\S]*?)\}@?|['"](\w+)['"])?\s*\)\s*export\s+class\s+(\w+)\s*\{([\s\S]*?)\n\}/g;

  let match: RegExpExecArray | null;
  let x = 80;
  let y = 80;

  while ((match = entityRegex.exec(codeText)) !== null) {
    const optsObjStr = match[1] || '';
    const simpleTableName = match[2] || '';
    const className = match[3]!;
    const classBody = match[4] || '';

    let tableName = simpleTableName || className.toLowerCase();
    let schemaName = '';

    if (optsObjStr) {
      const tableMatch = /tableName\s*:\s*['"](\w+)['"]/.exec(optsObjStr);
      if (tableMatch) tableName = tableMatch[1]!;

      const schemaMatch = /schema\s*:\s*['"](\w+)['"]/.exec(optsObjStr);
      if (schemaMatch) schemaName = schemaMatch[1]!.toLowerCase();
    }

    let schemaId = currentProject.schemas[0]?.id;
    if (schemaName) {
      if (!schemasMap.has(schemaName)) {
        const newSchema: SchemaGroup = {
          id: `schema-${schemaName}-${Date.now()}`,
          name: schemaName,
          color: colors[colorIdx++ % colors.length]!
        };
        schemasMap.set(schemaName, newSchema);
      }
      schemaId = schemasMap.get(schemaName)?.id || currentProject.schemas[0]?.id;
    }

    const columns: Column[] = [];
    const propLines = classBody.split('\n');

    let currentDecorators: string[] = [];
    let colIndex = 1;

    for (const rawLine of propLines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//')) continue;

      if (line.startsWith('@')) {
        currentDecorators.push(line);
        continue;
      }

      const propRegex = /^(\w+)\s*(\?|!)?\s*:\s*(\w+)(?:\s*=\s*(.+?))?;?$/;
      const propMatch = propRegex.exec(line);

      if (propMatch && currentDecorators.length > 0) {
        // Groups 1 and 3 are non-optional in propRegex; only 2 and 4 can be absent.
        const propName = propMatch[1]!;
        const isOptional = propMatch[2] === '?';
        const rawTsType = propMatch[3]!;
        const rawDefaultVal = propMatch[4]?.replace(';', '').trim();

        const combinedDec = currentDecorators.join(' ');
        const isPrimaryKey = combinedDec.includes('@PrimaryKey');
        const isEnum = combinedDec.includes('@Enum');

        let detectedEnumName: string | undefined = undefined;
        if (isEnum) {
          const enumRefMatch = /@Enum\s*\(\s*\(\s*\)\s*=>\s*(\w+)\s*\)/.exec(combinedDec);
          const enumItemsMatch = /items\s*:\s*\(\s*\)\s*=>\s*(\w+)/.exec(combinedDec);
          if (enumRefMatch) {
            detectedEnumName = enumRefMatch[1];
          } else if (enumItemsMatch) {
            detectedEnumName = enumItemsMatch[1];
          } else if (enums.some((e) => e.name === rawTsType)) {
            detectedEnumName = rawTsType;
          }
        }

        const type: DataType = isEnum ? 'ENUM' : mapTsTypeToDataType(rawTsType, combinedDec);
        const isNullable = combinedDec.includes('nullable: true') || isOptional;
        const isUnique = combinedDec.includes('unique: true');

        let defaultValue = rawDefaultVal;
        const defaultMatch = /default\s*:\s*([^,}]+)/.exec(combinedDec);
        const defaultRawMatch = /defaultRaw\s*:\s*['"]([^'"]+)['"]/.exec(combinedDec);
        if (defaultRawMatch) {
          defaultValue = defaultRawMatch[1]!;
        } else if (defaultMatch) {
          defaultValue = defaultMatch[1]!.trim();
        }

        columns.push({
          id: `${tableName}-col-${colIndex++}`,
          name: propName,
          type,
          enumName: detectedEnumName,
          isPrimaryKey,
          isNullable: isPrimaryKey ? false : isNullable,
          isUnique,
          defaultValue
        });

        currentDecorators = [];
      } else {
        currentDecorators = [];
      }
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
      color: schemasMap.get(schemaName || '')?.color || '#6366f1',
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
      return { ...t, position: existing.position, color: existing.color };
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
    schemas: Array.from(schemasMap.values()),
    enums: mergedEnums.length > 0 ? mergedEnums : (currentProject.enums || []),
    tables: mergedTables.length > 0 ? mergedTables : currentProject.tables
  };
}

function mapTsTypeToDataType(tsType: string, decoratorStr: string): DataType {
  if (decoratorStr.includes("type: 'text'") || decoratorStr.includes("type: 'varchar'")) return 'TEXT';
  if (decoratorStr.includes("columnType: 'bigint'")) return 'BIGINT';
  if (decoratorStr.includes("columnType: 'timestamptz'") || tsType === 'Date') return 'TIMESTAMP';
  if (tsType === 'number') return 'INT';
  if (tsType === 'boolean') return 'BOOLEAN';
  if (tsType === 'string') return 'VARCHAR';
  return 'VARCHAR';
}
