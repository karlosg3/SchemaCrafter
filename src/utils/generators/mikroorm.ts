import type { DatabaseProject, Table, DataType } from '../../types/schema';

export function generateMikroOrmSchema(project: DatabaseProject): string {
  let code = `import { Entity, PrimaryKey, Property, ManyToOne, Enum } from '@mikro-orm/core';\n\n`;

  // Output Enum definitions
  if (project.enums && project.enums.length > 0) {
    for (const enumDef of project.enums) {
      code += `export enum ${enumDef.name} {\n`;
      enumDef.values.forEach((val) => {
        const keyName = val.toUpperCase().replace(/[^A-Z0-9]/g, '_');
        code += `  ${keyName} = '${val}',\n`;
      });
      code += `}\n\n`;
    }
  }

  const tableMap = new Map<string, Table>();
  project.tables.forEach(t => tableMap.set(t.id, t));

  for (const table of project.tables) {
    const className = formatClassName(table.name);
    const schemaOption = table.schemaId ? `schema: '${getSchemaName(project, table.schemaId)}', ` : '';
    code += `@Entity({ ${schemaOption}tableName: '${table.name}' })\n`;
    code += `export class ${className} {\n`;

    for (const col of table.columns) {
      if (col.foreignKey) {
        const targetTable = tableMap.get(col.foreignKey.targetTableId);
        if (targetTable) {
          const targetClass = formatClassName(targetTable.name);
          const propName = col.name.replace(/_id$/i, '') || `${targetClass.toLowerCase()}Ref`;
          
          let decorator = `@ManyToOne(() => ${targetClass}`;
          const options: string[] = [];
          if (col.isNullable) options.push(`nullable: true`);
          if (col.foreignKey.onDelete) options.push(`onDelete: '${col.foreignKey.onDelete.toLowerCase()}'`);
          if (options.length > 0) {
            decorator += `, { ${options.join(', ')} }`;
          }
          decorator += `)`;

          code += `  ${decorator}\n`;
          code += `  ${propName}${col.isNullable ? '?' : '!'}: ${targetClass};\n\n`;
          continue;
        }
      }

      if (col.type === 'ENUM' && col.enumName) {
        let enumOpts = `items: () => ${col.enumName}`;
        if (col.defaultValue) {
          const defaultKey = col.defaultValue.toUpperCase().replace(/[^A-Z0-9]/g, '_');
          enumOpts += `, default: ${col.enumName}.${defaultKey}`;
        }
        code += `  @Enum({ ${enumOpts} })\n`;
        code += `  ${col.name}: ${col.enumName} = ${col.enumName}.${(col.defaultValue || col.name).toUpperCase().replace(/[^A-Z0-9]/g, '_')};\n\n`;
        continue;
      }

      const tsType = mapTsType(col.type);

      if (col.isPrimaryKey) {
        let pkDec = `@PrimaryKey()`;
        if (col.type === 'UUID') {
          pkDec = `@PrimaryKey({ type: 'uuid' })`;
        } else if (col.type === 'VARCHAR' || col.type === 'TEXT') {
          pkDec = `@PrimaryKey({ type: 'text' })`;
        }
        code += `  ${pkDec}\n`;
      } else {
        const propOpts: string[] = [];
        if (col.isNullable) propOpts.push('nullable: true');
        if (col.isUnique) propOpts.push('unique: true');
        if (col.defaultValue) propOpts.push(`default: '${col.defaultValue}'`);
        if (col.type === 'TIMESTAMP') propOpts.push("columnType: 'timestamptz'");
        
        let propDec = `@Property()`;
        if (propOpts.length > 0) {
          propDec = `@Property({ ${propOpts.join(', ')} })`;
        }
        code += `  ${propDec}\n`;
      }

      code += `  ${col.name}${col.isNullable ? '?' : '!'}: ${tsType};\n\n`;
    }

    code += `}\n\n`;
  }

  return code.trim();
}

function getSchemaName(project: DatabaseProject, schemaId: string): string {
  return project.schemas.find(s => s.id === schemaId)?.name || 'public';
}

function mapTsType(type: DataType): string {
  switch (type) {
    case 'INT':
    case 'BIGINT':
    case 'DECIMAL':
    case 'FLOAT':
      return 'number';
    case 'VARCHAR':
    case 'TEXT':
    case 'UUID':
    case 'ENUM':
      return 'string';
    case 'BOOLEAN':
      return 'boolean';
    case 'TIMESTAMP':
    case 'DATE':
      return 'Date';
    case 'JSON':
      return 'any';
    default:
      return 'string';
  }
}

function formatClassName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]/g, '_')
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}
