import type { DatabaseProject, Column } from '../types/schema';
import { formatCamelCase } from '../utils/naming';

export function generateDrizzleSchema(project: DatabaseProject): string {
  const engine = project.engine;
  const isPg = engine === 'postgresql';
  const isMysql = engine === 'mysql';
  
  const helperImports = new Set<string>();
  if (isPg) helperImports.add('pgTable').add('pgEnum').add('index');
  else if (isMysql) helperImports.add('mysqlTable').add('mysqlEnum').add('index');
  else helperImports.add('sqliteTable').add('index');

  let code = `import { ${Array.from(helperImports).join(', ')} } from 'drizzle-orm/${isPg ? 'pg-core' : isMysql ? 'mysql-core' : 'sqlite-core'}';\n\n`;

  // Output Enum declarations in Drizzle format
  if (project.enums && project.enums.length > 0) {
    for (const enumDef of project.enums) {
      const enumVar = `${formatCamelCase(enumDef.name)}Enum`;
      const enumSqlName = enumDef.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const valsStr = enumDef.values.map(v => `'${v}'`).join(', ');
      
      if (isPg) {
        code += `export const ${enumVar} = pgEnum('${enumSqlName}', [${valsStr}]);\n`;
      } else if (isMysql) {
        code += `export const ${enumVar} = mysqlEnum('${enumSqlName}', [${valsStr}]);\n`;
      }
    }
    code += `\n`;
  }

  for (const table of project.tables) {
    const tableVarName = formatCamelCase(table.name);
    const fnName = isPg ? 'pgTable' : isMysql ? 'mysqlTable' : 'sqliteTable';
    const indexedCols = table.columns.filter((c) => c.isIndexed);
    const tableIndexes = table.indexes || [];

    if (indexedCols.length > 0 || tableIndexes.length > 0) {
      code += `export const ${tableVarName} = ${fnName}('${table.name}', {\n`;
      for (const col of table.columns) {
        const colDef = generateColumnDef(col, isPg);
        code += `  ${col.name}: ${colDef},\n`;
      }
      code += `}, (table) => ({\n`;

      for (const col of indexedCols) {
        const idxVar = `${col.name}Idx`;
        const idxSqlName = `idx_${table.name}_${col.name}`;
        code += `  ${idxVar}: index('${idxSqlName}').on(table.${col.name}),\n`;
      }
      for (const idxDef of tableIndexes) {
        const idxVar = `${formatCamelCase(idxDef.name)}Idx`;
        const colsOn = idxDef.columnNames.map((c) => `table.${c}`).join(', ');
        code += `  ${idxVar}: index('${idxDef.name}').on(${colsOn}),\n`;
      }

      code += `}));\n\n`;
    } else {
      code += `export const ${tableVarName} = ${fnName}('${table.name}', {\n`;
      for (const col of table.columns) {
        const colDef = generateColumnDef(col, isPg);
        code += `  ${col.name}: ${colDef},\n`;
      }
      code += `});\n\n`;
    }
  }

  return code.trim();
}

function generateColumnDef(col: Column, isPg: boolean): string {
  let def: string;

  if (col.type === 'ENUM' && col.enumName) {
    const enumVar = `${formatCamelCase(col.enumName)}Enum`;
    def = `${enumVar}('${col.name}')`;
  } else if (col.type === 'INT') {
    def = isPg ? `integer('${col.name}')` : `int('${col.name}')`;
    if (col.isAutoIncrement) def += '.primaryKey()';
  } else if (col.type === 'VARCHAR') {
    def = `varchar('${col.name}', { length: ${col.length ?? 255} })`;
  } else if (col.type === 'TEXT') {
    def = `text('${col.name}')`;
  } else if (col.type === 'UUID') {
    def = isPg ? `uuid('${col.name}')` : `varchar('${col.name}', { length: 36 })`;
  } else if (col.type === 'BOOLEAN') {
    def = `boolean('${col.name}')`;
  } else if (col.type === 'DECIMAL') {
    def = `decimal('${col.name}', { precision: ${col.precision ?? 10}, scale: ${col.scale ?? 2} })`;
  } else if (col.type === 'TIMESTAMP') {
    def = `timestamp('${col.name}')`;
  } else {
    def = `text('${col.name}')`;
  }

  if (col.isPrimaryKey && !def.includes('.primaryKey()')) {
    def += '.primaryKey()';
  }
  if (!col.isNullable && !col.isPrimaryKey) {
    def += '.notNull()';
  }
  if (col.isUnique && !col.isPrimaryKey) {
    def += '.unique()';
  }

  if (col.defaultValue) {
    if (col.defaultValue.includes('NOW') || col.defaultValue.includes('now')) {
      def += '.defaultNow()';
    } else {
      def += `.default('${col.defaultValue}')`;
    }
  }

  return def;
}

