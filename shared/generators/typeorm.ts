import type { DatabaseProject, Table } from '../types/schema';
import { formatClassName, getSchemaName, mapTsType } from '../utils/naming';

export function generateTypeOrmSchema(project: DatabaseProject): string {
  let code = `import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';\n\n`;

  // Output Enum definitions in TypeORM format
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
    code += `@Entity({ ${schemaOption}name: '${table.name}' })\n`;
    code += `export class ${className} {\n`;

    for (const col of table.columns) {
      if (col.foreignKey) {
        const targetTable = tableMap.get(col.foreignKey.targetTableId);
        if (targetTable) {
          const targetClass = formatClassName(targetTable.name);
          const propName = col.name.replace(/_id$/i, '') || `${targetClass.toLowerCase()}Ref`;
          
          code += `  @ManyToOne(() => ${targetClass})\n`;
          code += `  @JoinColumn({ name: '${col.name}' })\n`;
          code += `  ${propName}${col.isNullable ? '?' : '!'}: ${targetClass};\n\n`;
          continue;
        }
      }

      if (col.type === 'ENUM' && col.enumName) {
        let enumOpts = `type: 'enum', enum: ${col.enumName}`;
        if (col.defaultValue) {
          const defaultKey = col.defaultValue.toUpperCase().replace(/[^A-Z0-9]/g, '_');
          enumOpts += `, default: ${col.enumName}.${defaultKey}`;
        }
        if (col.isNullable) enumOpts += `, nullable: true`;
        code += `  @Column({ ${enumOpts} })\n`;
        code += `  ${col.name}: ${col.enumName};\n\n`;
        continue;
      }

      if (col.isPrimaryKey) {
        if (col.type === 'UUID') {
          code += `  @PrimaryGeneratedColumn('uuid')\n`;
        } else if (col.isAutoIncrement || col.type === 'INT') {
          code += `  @PrimaryGeneratedColumn()\n`;
        } else {
          code += `  @Column({ primary: true })\n`;
        }
      } else {
        const colOpts: string[] = [];
        if (col.type === 'VARCHAR' && col.length !== undefined) colOpts.push(`length: ${col.length}`);
        if (col.type === 'DECIMAL' && (col.precision !== undefined || col.scale !== undefined)) {
          colOpts.push(`precision: ${col.precision ?? 10}`);
          colOpts.push(`scale: ${col.scale ?? 2}`);
        }
        if (col.isNullable) colOpts.push('nullable: true');
        if (col.isUnique) colOpts.push('unique: true');
        if (col.defaultValue) colOpts.push(`default: '${col.defaultValue}'`);
        
        let dec = `@Column()`;
        if (colOpts.length > 0) {
          dec = `@Column({ ${colOpts.join(', ')} })`;
        }
        code += `  ${dec}\n`;
      }

      const tsType = mapTsType(col.type);
      code += `  ${col.name}${col.isNullable ? '?' : '!'}: ${tsType};\n\n`;
    }

    code += `}\n\n`;
  }

  return code.trim();
}



