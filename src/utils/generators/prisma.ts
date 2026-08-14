import type { DatabaseProject, Table, DataType } from '../../types/schema';

export function generatePrismaSchema(project: DatabaseProject): string {
  let code = `datasource db {\n  provider = "${mapEngineToPrismaProvider(project.engine)}"\n  url      = env("DATABASE_URL")\n}\n\ngenerator client {\n  provider = "prisma-client-js"\n}\n\n`;

  // Output Enum declarations in Prisma syntax
  if (project.enums && project.enums.length > 0) {
    for (const enumDef of project.enums) {
      code += `enum ${enumDef.name} {\n`;
      enumDef.values.forEach((val) => {
        code += `  ${val}\n`;
      });
      code += `}\n\n`;
    }
  }

  // Track table lookup for relations
  const tableMap = new Map<string, Table>();
  project.tables.forEach(t => tableMap.set(t.id, t));

  for (const table of project.tables) {
    const modelName = formatModelName(table.name);
    code += `model ${modelName} {\n`;

    for (const col of table.columns) {
      let fieldType = mapPrismaType(col.type);
      if (col.type === 'ENUM' && col.enumName) {
        fieldType = col.enumName;
      }

      let line = `  ${formatFieldName(col.name)} ${fieldType}`;
      if (col.isNullable && !col.isPrimaryKey) {
        line += '?';
      }

      const attributes: string[] = [];
      if (col.isPrimaryKey) attributes.push('@id');
      if (col.isUnique && !col.isPrimaryKey) attributes.push('@unique');

      if (col.defaultValue) {
        if (col.type === 'UUID' && (col.defaultValue.includes('gen_random_uuid') || col.defaultValue.includes('uuid'))) {
          attributes.push('@default(uuid())');
        } else if (col.type === 'TIMESTAMP' && (col.defaultValue.includes('NOW') || col.defaultValue.includes('now'))) {
          attributes.push('@default(now())');
        } else if (col.isAutoIncrement) {
          attributes.push('@default(autoincrement())');
        } else if (col.type === 'ENUM') {
          attributes.push(`@default(${col.defaultValue})`);
        } else {
          attributes.push(`@default(${formatDefaultValue(col.defaultValue, col.type)})`);
        }
      }

      if (attributes.length > 0) {
        line += ` ${attributes.join(' ')}`;
      }

      code += line + '\n';

      // If foreign key exists, create relation field
      if (col.foreignKey) {
        const targetTable = tableMap.get(col.foreignKey.targetTableId);
        if (targetTable) {
          const targetModel = formatModelName(targetTable.name);
          const relFieldName = col.name.replace(/_id$/i, '') || targetModel.toLowerCase();
          const targetColName = targetTable.columns.find(c => c.id === col.foreignKey?.targetColumnId)?.name || 'id';
          
          code += `  ${relFieldName} ${targetModel} @relation(fields: [${formatFieldName(col.name)}], references: [${formatFieldName(targetColName)}])\n`;
        }
      }
    }

    // Output @@index attributes for Prisma
    const indexedCols = table.columns.filter((c) => c.isIndexed);
    const tableIndexes = table.indexes || [];

    for (const col of indexedCols) {
      code += `  @@index([${formatFieldName(col.name)}])\n`;
    }
    for (const idxDef of tableIndexes) {
      const fieldList = idxDef.columnNames.map(formatFieldName).join(', ');
      if (idxDef.isUnique) {
        code += `  @@unique([${fieldList}])\n`;
      } else {
        code += `  @@index([${fieldList}])\n`;
      }
    }

    code += `}\n\n`;
  }

  return code.trim();
}

function mapEngineToPrismaProvider(engine: string): string {
  switch (engine) {
    case 'mysql': return 'mysql';
    case 'sqlite': return 'sqlite';
    default: return 'postgresql';
  }
}

function mapPrismaType(type: DataType): string {
  switch (type) {
    case 'INT': return 'Int';
    case 'BIGINT': return 'BigInt';
    case 'VARCHAR':
    case 'TEXT':
    case 'UUID': return 'String';
    case 'BOOLEAN': return 'Boolean';
    case 'DECIMAL': return 'Decimal';
    case 'FLOAT': return 'Float';
    case 'TIMESTAMP':
    case 'DATE': return 'DateTime';
    case 'JSON': return 'Json';
    case 'ENUM': return 'String';
    default: return 'String';
  }
}

function formatModelName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]/g, '_')
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function formatFieldName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '');
}

function formatDefaultValue(val: string, type: DataType): string {
  if (type === 'BOOLEAN' || type === 'INT' || type === 'DECIMAL' || type === 'FLOAT') {
    return val;
  }
  return `"${val.replace(/"/g, '')}"`;
}
