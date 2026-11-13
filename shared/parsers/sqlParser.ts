import type {
  Column,
  DataType,
  DatabaseProject,
  EnumDefinition,
  ForeignKeyAction,
  IndexDefinition,
  SchemaGroup,
  Table
} from '../types/schema';
import { createId } from '../utils/ids';
import { formatClassName, mapSqlTypeToDataType } from '../utils/naming';
import { extractBalanced, normalizeFkAction, splitTopLevel, stripQuotes } from './helpers';

interface PendingForeignKey {
  sourceTable: Table;
  sourceColumnName: string;
  targetTableName: string;
  targetColumnName: string;
  onDelete?: ForeignKeyAction;
  onUpdate?: ForeignKeyAction;
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

export function parseSqlToProject(codeText: string, currentProject: DatabaseProject): DatabaseProject {
  const tables: Table[] = [];
  const pendingFks: PendingForeignKey[] = [];
  const schemasMap = new Map<string, SchemaGroup>();
  currentProject.schemas.forEach(s => schemasMap.set(s.name, s));

  let colorIdx = currentProject.schemas.length;

  const ensureSchema = (rawName: string): SchemaGroup => {
    const sName = rawName.toLowerCase();
    const existing = schemasMap.get(sName);
    if (existing) return existing;
    const created: SchemaGroup = {
      id: createId(`schema-${sName}`),
      name: sName,
      color: COLORS[colorIdx++ % COLORS.length]!
    };
    schemasMap.set(sName, created);
    return created;
  };

  // Strip comments while keeping string contents clean enough for DDL statements.
  const cleanSql = codeText
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // 1. Extract `CREATE SCHEMA` statements
  const schemaRegex = /CREATE\s+SCHEMA\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?/gim;
  let schemaMatch: RegExpExecArray | null;
  while ((schemaMatch = schemaRegex.exec(cleanSql)) !== null) {
    ensureSchema(schemaMatch[1]!);
  }

  // 2. Extract PostgreSQL `CREATE TYPE ... AS ENUM (...)` statements
  const enums: EnumDefinition[] = [];
  const enumBySqlName = new Map<string, EnumDefinition>();
  const enumRegex = /CREATE\s+TYPE\s+(?:[`"']?(\w+)[`"']?\.)?[`"']?(\w+)[`"']?\s+AS\s+ENUM\s*\(([\s\S]*?)\)/gim;
  let enumMatch: RegExpExecArray | null;
  const enumX = 1250;
  let enumY = 80;

  while ((enumMatch = enumRegex.exec(cleanSql)) !== null) {
    const rawSchema = enumMatch[1]?.toLowerCase();
    const sqlEnumName = enumMatch[2]!;
    const valsRaw = enumMatch[3] ?? '';

    const values = splitTopLevel(valsRaw)
      .map(v => stripQuotes(v))
      .filter(Boolean);

    const existingEnum = (currentProject.enums || []).find(
      e => e.name.toLowerCase().replace(/[^a-z0-9]/g, '_') === sqlEnumName.toLowerCase()
        || e.name.toLowerCase() === sqlEnumName.toLowerCase()
    );
    const displayName = existingEnum?.name ?? formatClassName(sqlEnumName);
    const schemaId = rawSchema ? ensureSchema(rawSchema).id : currentProject.schemas[0]?.id;

    const enumDef: EnumDefinition = {
      id: existingEnum?.id ?? createId(`enum-${sqlEnumName.toLowerCase()}`),
      name: displayName,
      values,
      schemaId: existingEnum?.schemaId ?? schemaId,
      position: existingEnum?.position ?? { x: enumX, y: enumY }
    };
    enums.push(enumDef);
    enumBySqlName.set(sqlEnumName.toLowerCase(), enumDef);
    enumBySqlName.set(displayName.toLowerCase(), enumDef);
    enumY += 280;
  }

  // Fallback enum map from currentProject for incremental SQL imports referencing existing enums
  for (const existing of currentProject.enums || []) {
    const normalized = existing.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    if (!enumBySqlName.has(normalized)) enumBySqlName.set(normalized, existing);
    if (!enumBySqlName.has(existing.name.toLowerCase())) enumBySqlName.set(existing.name.toLowerCase(), existing);
  }

  // 3. Parse `CREATE TABLE` blocks using balanced parentheses
  const createTableHeaderRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[`"']?(\w+)[`"']?\.)?[`"']?(\w+)[`"']?\s*\(/gim;
  let tableHeader: RegExpExecArray | null;
  let x = 80;
  let y = 80;

  while ((tableHeader = createTableHeaderRegex.exec(cleanSql)) !== null) {
    const rawSchema = tableHeader[1]?.toLowerCase();
    const rawTableName = tableHeader[2]!;
    const tableName = rawTableName.toLowerCase();

    const openParenIdx = tableHeader.index + tableHeader[0].lastIndexOf('(');
    const balanced = extractBalanced(cleanSql, openParenIdx, '(', ')');
    if (!balanced) continue;

    // Advance regex past this table body
    createTableHeaderRegex.lastIndex = balanced.endIndex + 1;

    const schemaId = rawSchema
      ? ensureSchema(rawSchema).id
      : currentProject.schemas[0]?.id;

    const columns: Column[] = [];
    const tablePkCols = new Set<string>();
    const tableUniqueCols = new Set<string>();
    const entries = splitTopLevel(balanced.content);

    let colIndex = 1;
    const syntheticTable: Table = {
      id: `table-${tableName}`,
      name: tableName,
      schemaId,
      position: { x, y },
      color: schemasMap.get(rawSchema || '')?.color || '#6366f1',
      columns
    };

    for (const entry of entries) {
      const trimmed = entry.trim();
      if (!trimmed) continue;

      // Table-level PRIMARY KEY (col1, ...)
      const pkMatch = /^(?:CONSTRAINT\s+[`"']?\w+[`"']?\s+)?PRIMARY\s+KEY\s*\(([^)]+)\)/i.exec(trimmed);
      if (pkMatch) {
        for (const colRef of pkMatch[1]!.split(',')) {
          tablePkCols.add(stripQuotes(colRef).toLowerCase());
        }
        continue;
      }

      // Table-level UNIQUE (col1)
      const uniqueMatch = /^(?:CONSTRAINT\s+[`"']?\w+[`"']?\s+)?UNIQUE\s*\(([^)]+)\)/i.exec(trimmed);
      if (uniqueMatch) {
        const uCols = uniqueMatch[1]!.split(',').map(c => stripQuotes(c).toLowerCase());
        if (uCols.length === 1 && uCols[0]) tableUniqueCols.add(uCols[0]);
        continue;
      }

      // Table-level FOREIGN KEY ("col") REFERENCES [schema.]"target" ("target_col") [ON DELETE ...] [ON UPDATE ...]
      const fkMatch = /^(?:CONSTRAINT\s+[`"']?\w+[`"']?\s+)?FOREIGN\s+KEY\s*\(\s*([^)]+)\s*\)\s*REFERENCES\s+(?:[`"']?(\w+)[`"']?\.)?[`"']?(\w+)[`"']?\s*\(\s*([^)]+)\s*\)([\s\S]*)$/i.exec(trimmed);
      if (fkMatch) {
        const sourceColName = stripQuotes(fkMatch[1]!.split(',')[0] ?? '');
        const targetTableName = stripQuotes(fkMatch[3]!).toLowerCase();
        const targetColName = stripQuotes(fkMatch[4]!.split(',')[0] ?? '');
        const tail = fkMatch[5] || '';
        const onDeleteMatch = /\bON\s+DELETE\s+(CASCADE|RESTRICT|SET\s+NULL|NO\s+ACTION)/i.exec(tail);
        const onUpdateMatch = /\bON\s+UPDATE\s+(CASCADE|RESTRICT|SET\s+NULL|NO\s+ACTION)/i.exec(tail);

        if (sourceColName && targetTableName && targetColName) {
          pendingFks.push({
            sourceTable: syntheticTable,
            sourceColumnName: sourceColName,
            targetTableName,
            targetColumnName: targetColName,
            onDelete: normalizeFkAction(onDeleteMatch?.[1]),
            onUpdate: normalizeFkAction(onUpdateMatch?.[1])
          });
        }
        continue;
      }

      if (/^(?:CONSTRAINT|CHECK|INDEX|KEY)\b/i.test(trimmed)) continue;

      // Column definition: `"col_name" TYPE(...) [constraints...]`
      const colHeaderMatch = /^([`"']?[^`"'\s]+[`"']?)\s+([a-zA-Z_][\w"]*(?:\s+(?:PRECISION|VARYING))?(?:\s*\([^)]*\))?)([\s\S]*)$/i.exec(trimmed);
      if (!colHeaderMatch) continue;

      const colName = stripQuotes(colHeaderMatch[1]!);
      const rawTypeToken = colHeaderMatch[2]!.trim();
      const rest = colHeaderMatch[3] || '';
      const restUpper = rest.toUpperCase();

      // Match ENUM type by name or schema-qualified enum name
      const cleanEnumCandidate = rawTypeToken
        .split('.')
        .pop()!
        .replace(/[`"']/g, '')
        .replace(/\([^)]*\)/g, '')
        .toLowerCase();
      const matchedEnum = enumBySqlName.get(cleanEnumCandidate);

      const type: DataType = matchedEnum ? 'ENUM' : mapSqlTypeToDataType(rawTypeToken);
      const paramMatch = /\(\s*(\d+)(?:\s*,\s*(\d+))?\s*\)/.exec(rawTypeToken);
      const parsedLength = type === 'VARCHAR' && paramMatch?.[1] ? Number.parseInt(paramMatch[1], 10) : undefined;
      const parsedPrecision = type === 'DECIMAL' && paramMatch?.[1] ? Number.parseInt(paramMatch[1], 10) : undefined;
      const parsedScale = type === 'DECIMAL' && paramMatch?.[2] !== undefined ? Number.parseInt(paramMatch[2], 10) : undefined;
      const isPrimaryKey = /\bPRIMARY\s+KEY\b/i.test(restUpper);
      const isNullable = !/\bNOT\s+NULL\b/i.test(restUpper) && !isPrimaryKey;
      const isUnique = /\bUNIQUE\b/i.test(restUpper);
      const isAutoIncrement =
        /\b(?:AUTO_INCREMENT|AUTOINCREMENT)\b/i.test(restUpper)
        || /\b(?:BIGSERIAL|SERIAL)\b/i.test(rawTypeToken.toUpperCase());

      let defaultValue: string | undefined;
      const defaultMatch = /\bDEFAULT\s+((?:'(?:''|[^'])*')|(?:\w+\s*\([^)]*\))|[^\s,]+)/i.exec(rest);
      if (defaultMatch) {
        const rawDefault = defaultMatch[1]!.trim();
        defaultValue = rawDefault.startsWith("'") && rawDefault.endsWith("'")
          ? rawDefault.slice(1, -1).replace(/''/g, "'")
          : rawDefault;
      }

      // Inline `REFERENCES target(col)` clause
      const inlineRefMatch = /\bREFERENCES\s+(?:[`"']?(\w+)[`"']?\.)?[`"']?(\w+)[`"']?\s*\(\s*([^)]+)\s*\)([\s\S]*)/i.exec(rest);
      if (inlineRefMatch) {
        const targetTableName = stripQuotes(inlineRefMatch[2]!).toLowerCase();
        const targetColName = stripQuotes(inlineRefMatch[3]!.split(',')[0] ?? '');
        const tail = inlineRefMatch[4] || '';
        const onDeleteMatch = /\bON\s+DELETE\s+(CASCADE|RESTRICT|SET\s+NULL|NO\s+ACTION)/i.exec(tail);
        const onUpdateMatch = /\bON\s+UPDATE\s+(CASCADE|RESTRICT|SET\s+NULL|NO\s+ACTION)/i.exec(tail);

        pendingFks.push({
          sourceTable: syntheticTable,
          sourceColumnName: colName,
          targetTableName,
          targetColumnName: targetColName,
          onDelete: normalizeFkAction(onDeleteMatch?.[1]),
          onUpdate: normalizeFkAction(onUpdateMatch?.[1])
        });
      }

      columns.push({
        id: `${tableName}-col-${colIndex++}`,
        name: colName,
        type,
        ...(parsedLength !== undefined && parsedLength > 0 ? { length: parsedLength } : {}),
        ...(parsedPrecision !== undefined && parsedPrecision > 0 ? { precision: parsedPrecision } : {}),
        ...(parsedScale !== undefined && parsedScale >= 0 ? { scale: parsedScale } : {}),
        enumName: matchedEnum?.name,
        isPrimaryKey,
        isNullable: isPrimaryKey ? false : isNullable,
        isUnique,
        isAutoIncrement,
        ...(defaultValue !== undefined ? { defaultValue } : {})
      });
    }

    // Apply table-level PK / UNIQUE constraints onto parsed columns
    for (const col of columns) {
      if (tablePkCols.has(col.name.toLowerCase())) {
        col.isPrimaryKey = true;
        col.isNullable = false;
      }
      if (tableUniqueCols.has(col.name.toLowerCase())) {
        col.isUnique = true;
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

    tables.push(syntheticTable);

    x += 380;
    if (x > 1100) {
      x = 80;
      y += 340;
    }
  }

  // 4. Parse `CREATE [UNIQUE] INDEX` statements
  const indexRegex = /CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?\s+ON\s+(?:[`"']?(\w+)[`"']?\.)?[`"']?(\w+)[`"']?(?:\s+USING\s+(\w+))?\s*\(([^)]+)\)/gim;
  let idxMatch: RegExpExecArray | null;
  while ((idxMatch = indexRegex.exec(cleanSql)) !== null) {
    const isUnique = Boolean(idxMatch[1]);
    const idxName = idxMatch[2]!;
    const tableName = idxMatch[4]!.toLowerCase();
    const rawIndexType = idxMatch[5]?.toUpperCase();
    const colNames = idxMatch[6]!
      .split(',')
      .map(c => stripQuotes(c.trim()))
      .filter(Boolean);

    const targetTable = tables.find(t => t.name === tableName);
    if (!targetTable || colNames.length === 0) continue;

    if (!isUnique && colNames.length === 1 && !rawIndexType) {
      const col = targetTable.columns.find(c => c.name.toLowerCase() === colNames[0]!.toLowerCase());
      if (col) {
        col.isIndexed = true;
        continue;
      }
    }

    const validType = rawIndexType === 'BTREE' || rawIndexType === 'HASH' || rawIndexType === 'GIN' || rawIndexType === 'GIST'
      ? rawIndexType
      : undefined;
    const idxDef: IndexDefinition = {
      id: createId('idx'),
      name: idxName,
      columnNames: colNames,
      ...(isUnique ? { isUnique: true } : {}),
      ...(validType ? { type: validType } : {})
    };
    targetTable.indexes = [...(targetTable.indexes ?? []), idxDef];
  }

  // 5. Parse `COMMENT ON TABLE / COLUMN`
  const tableCommentRegex = /COMMENT\s+ON\s+TABLE\s+(?:[`"']?(\w+)[`"']?\.)?[`"']?(\w+)[`"']?\s+IS\s+'((?:''|[^'])*)'/gim;
  let tCommentMatch: RegExpExecArray | null;
  while ((tCommentMatch = tableCommentRegex.exec(cleanSql)) !== null) {
    const tableName = tCommentMatch[2]!.toLowerCase();
    const targetTable = tables.find(t => t.name === tableName);
    if (targetTable) targetTable.comment = tCommentMatch[3]!.replace(/''/g, "'");
  }

  const colCommentRegex = /COMMENT\s+ON\s+COLUMN\s+(?:[`"']?(\w+)[`"']?\.)?[`"']?(\w+)[`"']?\.[`"']?(\w+)[`"']?\s+IS\s+'((?:''|[^'])*)'/gim;
  let cCommentMatch: RegExpExecArray | null;
  while ((cCommentMatch = colCommentRegex.exec(cleanSql)) !== null) {
    const tableName = cCommentMatch[2]!.toLowerCase();
    const colName = cCommentMatch[3]!.toLowerCase();
    const targetTable = tables.find(t => t.name === tableName);
    const targetCol = targetTable?.columns.find(c => c.name.toLowerCase() === colName);
    if (targetCol) targetCol.comment = cCommentMatch[4]!.replace(/''/g, "'");
  }

  // 6. Preserve ids/positions/colors of existing tables so inbound relationships stay valid
  const existingMap = new Map<string, Table>();
  currentProject.tables.forEach(t => existingMap.set(t.name, t));

  const mergedTables = tables.map((t) => {
    const existing = existingMap.get(t.name);
    if (existing) {
      t.id = existing.id;
      t.position = existing.position;
      t.color = existing.color;
      for (const col of t.columns) {
        const existingCol = existing.columns.find(c => c.name.toLowerCase() === col.name.toLowerCase());
        if (existingCol) col.id = existingCol.id;
      }
    }
    return t;
  });

  // 7. Resolve deferred foreign keys against parsed tables (or currentProject fallback)
  const parsedTableByName = new Map(mergedTables.map(t => [t.name.toLowerCase(), t]));
  for (const fk of pendingFks) {
    const sourceCol = fk.sourceTable.columns.find(
      c => c.name.toLowerCase() === fk.sourceColumnName.toLowerCase()
    );
    const targetTable = parsedTableByName.get(fk.targetTableName) ?? existingMap.get(fk.targetTableName);
    const targetCol = targetTable?.columns.find(
      c => c.name.toLowerCase() === fk.targetColumnName.toLowerCase()
    );
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
    schemas: Array.from(schemasMap.values()),
    enums: enums.length > 0 ? enums : (currentProject.enums || []),
    tables: mergedTables
  };
}
