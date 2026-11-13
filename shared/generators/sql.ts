import type { DatabaseProject, Column, DataType } from '../types/schema';

export function generateSqlDdl(project: DatabaseProject): string {
  const engine = project.engine;
  let sql = `-- Generated DDL Schema for ${project.name} (${engine.toUpperCase()})\n\n`;

  // Output CREATE SCHEMA statements
  if (project.schemas.length > 0) {
    for (const schema of project.schemas) {
      sql += `CREATE SCHEMA IF NOT EXISTS "${schema.name}";\n`;
    }
    sql += `\n`;
  }

  // Output CREATE TYPE ... AS ENUM (...) statements
  if (project.enums && project.enums.length > 0) {
    sql += `-- Enum Types Definitions\n`;
    for (const enumDef of project.enums) {
      const enumSqlName = enumDef.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const valsStr = enumDef.values.map((v) => `'${v}'`).join(', ');
      
      if (engine === 'postgresql') {
        sql += `CREATE TYPE ${enumSqlName} AS ENUM (${valsStr});\n`;
      } else if (engine === 'mysql') {
        sql += `-- MySQL Enum: ${enumSqlName} (${valsStr})\n`;
      }
    }
    sql += `\n`;
  }

  for (const table of project.tables) {
    const schemaPrefix = getSqlSchemaPrefix(project, table.schemaId);
    sql += `CREATE TABLE ${schemaPrefix}"${table.name}" (\n`;

    const colLines: string[] = [];
    const constraints: string[] = [];

    for (const col of table.columns) {
      let line = `  "${col.name}" ${mapSqlType(col, engine)}`;

      if (col.isPrimaryKey) {
        line += ' PRIMARY KEY';
      }
      if (!col.isNullable && !col.isPrimaryKey) {
        line += ' NOT NULL';
      }
      if (col.isUnique && !col.isPrimaryKey) {
        line += ' UNIQUE';
      }

      if (col.defaultValue) {
        line += ` DEFAULT ${formatSqlDefault(col.defaultValue, col.type)}`;
      }

      colLines.push(line);

      if (col.foreignKey) {
        const targetTable = project.tables.find((t) => t.id === col.foreignKey?.targetTableId);
        if (targetTable) {
          const targetCol = targetTable.columns.find((c) => c.id === col.foreignKey?.targetColumnId);
          const targetColName = targetCol ? targetCol.name : 'id';
          const targetPrefix = getSqlSchemaPrefix(project, targetTable.schemaId);
          
          let fkStr = `  CONSTRAINT "fk_${table.name}_${col.name}" FOREIGN KEY ("${col.name}") REFERENCES ${targetPrefix}"${targetTable.name}" ("${targetColName}")`;
          if (col.foreignKey.onDelete) {
            fkStr += ` ON DELETE ${col.foreignKey.onDelete}`;
          }
          if (col.foreignKey.onUpdate) {
            fkStr += ` ON UPDATE ${col.foreignKey.onUpdate}`;
          }
          constraints.push(fkStr);
        }
      }
    }

    sql += [...colLines, ...constraints].join(',\n');
    sql += `\n);\n\n`;

    // Output CREATE INDEX statements for indexed columns
    const indexedCols = table.columns.filter((c) => c.isIndexed);
    const tableIndexes = table.indexes || [];

    if (indexedCols.length > 0 || tableIndexes.length > 0) {
      sql += `-- Indexes for ${table.name}\n`;
      for (const col of indexedCols) {
        const idxName = `idx_${table.name}_${col.name}`;
        sql += `CREATE INDEX "${idxName}" ON ${schemaPrefix}"${table.name}" ("${col.name}");\n`;
      }
      for (const idxDef of tableIndexes) {
        const colsList = idxDef.columnNames.map((c) => `"${c}"`).join(', ');
        const uniqueKeyword = idxDef.isUnique ? 'UNIQUE ' : '';
        sql += `CREATE ${uniqueKeyword}INDEX "${idxDef.name}" ON ${schemaPrefix}"${table.name}" (${colsList});\n`;
      }
      sql += `\n`;
    }

    const commentStatements: string[] = [];
    if (engine === 'postgresql') {
      if (table.comment?.trim()) {
        commentStatements.push(`COMMENT ON TABLE ${schemaPrefix}"${table.name}" IS '${escapeSqlString(table.comment.trim())}';`);
      }
      for (const col of table.columns) {
        if (col.comment?.trim()) {
          commentStatements.push(`COMMENT ON COLUMN ${schemaPrefix}"${table.name}"."${col.name}" IS '${escapeSqlString(col.comment.trim())}';`);
        }
      }
      if (commentStatements.length > 0) {
        sql += `${commentStatements.join('\n')}\n\n`;
      }
    }
  }

  return sql.trim();
}

function escapeSqlString(val: string): string {
  return val.replace(/'/g, "''");
}

function getSqlSchemaPrefix(project: DatabaseProject, schemaId?: string): string {
  if (!schemaId) return '';
  const schema = project.schemas.find((s) => s.id === schemaId);
  if (!schema || schema.name === 'public') return '';
  return `"${schema.name}".`;
}

function mapSqlType(col: Column, engine: string): string {
  if (col.type === 'ENUM' && col.enumName) {
    if (engine === 'postgresql') {
      return col.enumName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    }
    return 'VARCHAR(255)';
  }

  switch (col.type) {
    case 'INT':
      return col.isAutoIncrement ? (engine === 'postgresql' ? 'SERIAL' : 'INT AUTO_INCREMENT') : 'INTEGER';
    case 'BIGINT':
      return col.isAutoIncrement ? (engine === 'postgresql' ? 'BIGSERIAL' : 'BIGINT AUTO_INCREMENT') : 'BIGINT';
    case 'VARCHAR':
      return 'VARCHAR(255)';
    case 'TEXT':
      return 'TEXT';
    case 'UUID':
      return engine === 'postgresql' ? 'UUID' : 'VARCHAR(36)';
    case 'BOOLEAN':
      return engine === 'postgresql' ? 'BOOLEAN' : 'TINYINT(1)';
    case 'DECIMAL':
      return 'NUMERIC(10, 2)';
    case 'FLOAT':
      return 'DOUBLE PRECISION';
    case 'TIMESTAMP':
      return engine === 'postgresql' ? 'TIMESTAMPTZ' : 'DATETIME';
    case 'DATE':
      return 'DATE';
    case 'JSON':
      return engine === 'postgresql' ? 'JSONB' : 'JSON';
    default:
      return 'VARCHAR(255)';
  }
}

function formatSqlDefault(val: string, type: DataType): string {
  if (val.toUpperCase().includes('NOW()') || val.toUpperCase().includes('CURRENT_TIMESTAMP')) {
    return 'CURRENT_TIMESTAMP';
  }
  if (val.toUpperCase().includes('GEN_RANDOM_UUID()') || val.toUpperCase().includes('UUID()')) {
    return 'gen_random_uuid()';
  }
  if (type === 'BOOLEAN' || type === 'INT' || type === 'BIGINT' || type === 'DECIMAL' || type === 'FLOAT') {
    return val;
  }
  return `'${val.replace(/'/g, "''")}'`;
}
