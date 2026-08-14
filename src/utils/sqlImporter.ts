import type { Table, Column, DataType } from '../types/schema';

export function parseSqlToTables(sqlText: string): Table[] {
  const tables: Table[] = [];
  
  const cleanSql = sqlText
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[`"']?\w+[`"']?\.)?[`"']?(\w+)[`"']?\s*\(([\s\S]*?)\);/gim;

  let match: RegExpExecArray | null;
  let xOffset = 80;
  let yOffset = 80;

  while ((match = createTableRegex.exec(cleanSql)) !== null) {
    const tableName = match[1];
    const body = match[2];

    const columns: Column[] = [];
    const rawLines = body.split(',\n');

    let colIndex = 1;
    for (const rawLine of rawLines) {
      const line = rawLine.trim();
      if (!line || line.toUpperCase().startsWith('CONSTRAINT') || line.toUpperCase().startsWith('PRIMARY KEY') || line.toUpperCase().startsWith('FOREIGN KEY')) {
        continue;
      }

      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;

      const colName = parts[0].replace(/[`"']/g, '');
      const typeRaw = parts[1].toUpperCase().replace(/\(\d+\)/g, '');

      const type: DataType = mapRawTypeToDataType(typeRaw);
      const isPrimaryKey = line.toUpperCase().includes('PRIMARY KEY');
      const isNullable = !line.toUpperCase().includes('NOT NULL') && !isPrimaryKey;
      const isUnique = line.toUpperCase().includes('UNIQUE');
      const isAutoIncrement = line.toUpperCase().includes('AUTOINCREMENT') || line.toUpperCase().includes('AUTO_INCREMENT') || line.toUpperCase().includes('SERIAL');

      columns.push({
        id: `${tableName}-col-${colIndex++}`,
        name: colName,
        type,
        isPrimaryKey,
        isNullable,
        isUnique,
        isAutoIncrement
      });
    }

    tables.push({
      id: `table-${tableName.toLowerCase()}`,
      name: tableName,
      position: { x: xOffset, y: yOffset },
      columns
    });

    xOffset += 380;
    if (xOffset > 1100) {
      xOffset = 80;
      yOffset += 320;
    }
  }

  return tables;
}

function mapRawTypeToDataType(rawType: string): DataType {
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
