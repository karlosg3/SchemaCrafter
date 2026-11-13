import type {
  Column,
  DataType,
  DatabaseProject,
  EnumDefinition,
  ForeignKeyAction,
  IndexDefinition,
  Table
} from '../types/schema';
import { createId } from '../utils/ids';
import { formatCamelCase, formatClassName } from '../utils/naming';
import { extractBalanced, normalizeFkAction, splitTopLevel, stripQuotes } from './helpers';

interface PendingDrizzleFk {
  sourceTable: Table;
  sourceColumnName: string;
  targetTableVar: string;
  targetColumnKey: string;
  onDelete?: ForeignKeyAction;
  onUpdate?: ForeignKeyAction;
}

export function parseDrizzleToProject(codeText: string, currentProject: DatabaseProject): DatabaseProject {
  const enums: EnumDefinition[] = [];
  const enumByVarName = new Map<string, EnumDefinition>();

  // 1. Parse `export const fooEnum = pgEnum('foo', ['a', 'b'])` or `mysqlEnum(...)`
  const enumRegex = /(?:export\s+)?const\s+(\w+)\s*=\s*(?:pgEnum|mysqlEnum)\s*\(\s*['"]([^'"]+)['"]\s*,\s*\[([\s\S]*?)\]\s*\)\s*;?/g;
  let enumMatch: RegExpExecArray | null;
  let enumY = 80;

  while ((enumMatch = enumRegex.exec(codeText)) !== null) {
    const enumVar = enumMatch[1]!;
    const rawSqlName = enumMatch[2]!;
    const valsRaw = enumMatch[3]!;
    const values = splitTopLevel(valsRaw).map(v => stripQuotes(v)).filter(Boolean);

    const existing = (currentProject.enums || []).find(
      e => `${formatCamelCase(e.name)}Enum` === enumVar
        || e.name.toLowerCase().replace(/[^a-z0-9]/g, '_') === rawSqlName.toLowerCase()
    );
    const displayName = existing?.name ?? formatClassName(enumVar.replace(/Enum$/, '') || rawSqlName);

    const enumDef: EnumDefinition = {
      id: existing?.id ?? createId(`enum-${rawSqlName.toLowerCase()}`),
      name: displayName,
      values,
      schemaId: existing?.schemaId ?? currentProject.schemas[0]?.id,
      position: existing?.position ?? { x: 1250, y: enumY }
    };
    enums.push(enumDef);
    enumByVarName.set(enumVar, enumDef);
    enumY += 280;
  }

  for (const existing of currentProject.enums || []) {
    const varName = `${formatCamelCase(existing.name)}Enum`;
    if (!enumByVarName.has(varName)) enumByVarName.set(varName, existing);
  }

  // 2. Parse `(export )?const tableVar = (pgTable|mysqlTable|sqliteTable)('table_name', { ... }[, (table) => ({ ... })])`
  const tables: Table[] = [];
  const tableByVarName = new Map<string, Table>();
  const pendingFks: PendingDrizzleFk[] = [];

  const tableHeaderRegex = /(?:export\s+)?const\s+(\w+)\s*=\s*(?:pgTable|mysqlTable|sqliteTable)\s*\(\s*['"](\w+)['"]\s*,\s*\{/g;
  let headerMatch: RegExpExecArray | null;
  let x = 80;
  let y = 80;

  while ((headerMatch = tableHeaderRegex.exec(codeText)) !== null) {
    const tableVar = headerMatch[1]!;
    const tableName = headerMatch[2]!.toLowerCase();
    const openBraceIdx = headerMatch.index + headerMatch[0].lastIndexOf('{');
    const fieldsBalanced = extractBalanced(codeText, openBraceIdx, '{', '}');
    if (!fieldsBalanced) continue;

    let resumeIndex = fieldsBalanced.endIndex + 1;

    // Optional 3rd argument callback `(table) => ({ ... })` or `(table) => [...]`
    let indexBody = '';
    const afterFields = codeText.slice(fieldsBalanced.endIndex + 1);
    const callbackMatch = /^\s*,\s*(?:\(?\s*\w+\s*\)?\s*=>\s*)\(?(\{|\[)/.exec(afterFields);
    if (callbackMatch) {
      const openChar = callbackMatch[1]!;
      const closeChar = openChar === '{' ? '}' : ']';
      const absOpenIdx = fieldsBalanced.endIndex + 1 + callbackMatch[0].length - 1;
      const idxBalanced = extractBalanced(codeText, absOpenIdx, openChar, closeChar);
      if (idxBalanced) {
        indexBody = idxBalanced.content;
        resumeIndex = idxBalanced.endIndex + 1;
      }
    }

    tableHeaderRegex.lastIndex = resumeIndex;

    const columns: Column[] = [];
    const fieldEntries = splitTopLevel(fieldsBalanced.content);
    const colKeyToName = new Map<string, string>();
    let colIndex = 1;

    for (const entry of fieldEntries) {
      const cleanEntry = entry.replace(/^\/\/.*$/gm, '').trim();
      if (!cleanEntry) continue;

      const colonIdx = cleanEntry.indexOf(':');
      if (colonIdx === -1) continue;

      const propKey = cleanEntry.slice(0, colonIdx).trim();
      const rightHand = cleanEntry.slice(colonIdx + 1).trim();

      const fnCallMatch = /^(\w+)\s*\(\s*['"]([^'"]+)['"]/.exec(rightHand);
      const fnName = fnCallMatch?.[1] ?? 'text';
      const sqlColName = fnCallMatch?.[2] ?? propKey;
      colKeyToName.set(propKey, sqlColName);

      const matchedEnum = enumByVarName.get(fnName);
      const type: DataType = matchedEnum ? 'ENUM' : mapDrizzleTypeToDataType(fnName);

      const isPrimaryKey = rightHand.includes('.primaryKey(');
      const isNullable = !rightHand.includes('.notNull(') && !isPrimaryKey;
      const isUnique = rightHand.includes('.unique(');
      const isAutoIncrement = fnName === 'serial' || fnName === 'bigserial';

      let defaultValue: string | undefined;
      if (rightHand.includes('.defaultNow(')) {
        defaultValue = 'NOW()';
      } else if (rightHand.includes('.defaultRandom(')) {
        defaultValue = 'gen_random_uuid()';
      } else {
        const defaultStart = /\.default\s*\(/.exec(rightHand);
        if (defaultStart) {
          const openIdx = defaultStart.index + defaultStart[0].length - 1;
          const bal = extractBalanced(rightHand, openIdx, '(', ')');
          if (bal) defaultValue = stripQuotes(bal.content);
        }
      }

      const col: Column = {
        id: `${tableName}-col-${colIndex++}`,
        name: sqlColName,
        type,
        enumName: matchedEnum?.name,
        isPrimaryKey,
        isNullable: isPrimaryKey ? false : isNullable,
        isUnique,
        ...(isAutoIncrement ? { isAutoIncrement: true } : {}),
        ...(defaultValue !== undefined ? { defaultValue } : {})
      };

      // Parse `.references(() => targetTable.targetCol[, { onDelete, onUpdate }])`
      const refMatch = /\.references\(\s*\(\s*\)\s*=>\s*(\w+)\.(\w+)\s*(?:,\s*\{([\s\S]*?)\})?\s*\)/.exec(rightHand);
      if (refMatch) {
        const refOpts = refMatch[3] || '';
        const onDeleteMatch = /onDelete\s*:\s*['"]([^'"]+)['"]/i.exec(refOpts);
        const onUpdateMatch = /onUpdate\s*:\s*['"]([^'"]+)['"]/i.exec(refOpts);

        pendingFks.push({
          sourceTable: undefined as unknown as Table, // populated right after table object exists
          sourceColumnName: sqlColName,
          targetTableVar: refMatch[1]!,
          targetColumnKey: refMatch[2]!,
          onDelete: normalizeFkAction(onDeleteMatch?.[1]),
          onUpdate: normalizeFkAction(onUpdateMatch?.[1])
        });
      }

      columns.push(col);
    }

    const tableObj: Table = {
      id: `table-${tableName}`,
      name: tableName,
      schemaId: currentProject.schemas[0]?.id,
      position: { x, y },
      color: '#10b981',
      columns
    };

    // Attach sourceTable to newly queued FKs from this table
    for (let i = pendingFks.length - 1; i >= 0; i--) {
      if (pendingFks[i]!.sourceTable) break;
      pendingFks[i]!.sourceTable = tableObj;
    }

    // 3. Parse index definitions inside the 3rd callback argument
    if (indexBody.trim()) {
      for (const idxItem of splitTopLevel(indexBody)) {
        const idxCall = /(uniqueIndex|index)\s*\(\s*['"]([^'"]+)['"]\s*\)\.on\(([^)]+)\)/.exec(idxItem);
        if (!idxCall) continue;

        const isUniqueIdx = idxCall[1] === 'uniqueIndex';
        const idxName = idxCall[2]!;
        const onCols = idxCall[3]!
          .split(',')
          .map((arg) => {
            const prop = arg.trim().split('.').pop() || '';
            return colKeyToName.get(prop) ?? prop;
          })
          .filter(Boolean);

        if (onCols.length === 0) continue;
        if (!isUniqueIdx && onCols.length === 1) {
          const singleCol = columns.find(c => c.name === onCols[0]);
          if (singleCol) {
            singleCol.isIndexed = true;
            continue;
          }
        }

        const idxDef: IndexDefinition = {
          id: createId('idx'),
          name: idxName,
          columnNames: onCols,
          ...(isUniqueIdx ? { isUnique: true } : {})
        };
        tableObj.indexes = [...(tableObj.indexes ?? []), idxDef];
      }
    }

    tables.push(tableObj);
    tableByVarName.set(tableVar, tableObj);
    tableByVarName.set(tableName, tableObj);

    x += 380;
    if (x > 1100) {
      x = 80;
      y += 340;
    }
  }

  // Preserve ids/positions/colors of existing tables
  const existingMap = new Map<string, Table>();
  currentProject.tables.forEach(t => existingMap.set(t.name, t));

  const mergedTables = tables.map((t) => {
    const existing = existingMap.get(t.name);
    if (existing) {
      t.id = existing.id;
      t.position = existing.position;
      t.color = existing.color;
      t.schemaId = existing.schemaId;
    }
    return t;
  });

  // Resolve deferred `.references(...)` foreign keys
  for (const fk of pendingFks) {
    const sourceCol = fk.sourceTable.columns.find(c => c.name === fk.sourceColumnName);
    const targetTable = tableByVarName.get(fk.targetTableVar)
      ?? mergedTables.find(t => formatCamelCase(t.name) === fk.targetTableVar || t.name === fk.targetTableVar);
    const targetCol = targetTable?.columns.find(c => c.name === fk.targetColumnKey);

    if (sourceCol && targetTable && targetCol) {
      sourceCol.foreignKey = {
        targetTableId: targetTable.id,
        targetColumnId: targetCol.id,
        ...(fk.onDelete ? { onDelete: fk.onDelete } : {}),
        ...(fk.onUpdate ? { onUpdate: fk.onUpdate } : {})
      };
    }
  }

  return {
    ...currentProject,
    enums: enums.length > 0 ? enums : (currentProject.enums || []),
    tables: mergedTables.length > 0 ? mergedTables : currentProject.tables
  };
}

function mapDrizzleTypeToDataType(rawType: string): DataType {
  switch (rawType) {
    case 'bigserial':
    case 'bigint':
      return 'BIGINT';
    case 'serial':
    case 'integer':
    case 'int':
      return 'INT';
    case 'varchar':
      return 'VARCHAR';
    case 'text':
      return 'TEXT';
    case 'uuid':
      return 'UUID';
    case 'boolean':
      return 'BOOLEAN';
    case 'timestamp':
      return 'TIMESTAMP';
    case 'date':
      return 'DATE';
    case 'decimal':
    case 'numeric':
      return 'DECIMAL';
    case 'real':
    case 'doublePrecision':
      return 'FLOAT';
    case 'json':
    case 'jsonb':
      return 'JSON';
    default:
      return 'VARCHAR';
  }
}
