export type DataType = 
  | 'INT'
  | 'BIGINT'
  | 'VARCHAR'
  | 'TEXT'
  | 'BOOLEAN'
  | 'UUID'
  | 'DECIMAL'
  | 'FLOAT'
  | 'TIMESTAMP'
  | 'DATE'
  | 'JSON'
  | 'ENUM';

export type ForeignKeyAction = 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'NO ACTION';

export interface ForeignKeyReference {
  targetTableId: string;
  targetColumnId: string;
  onUpdate?: ForeignKeyAction;
  onDelete?: ForeignKeyAction;
}

export interface IndexDefinition {
  id: string;
  name: string;
  columnNames: string[];
  isUnique?: boolean;
  type?: 'BTREE' | 'HASH' | 'GIN' | 'GIST';
}

export interface EnumDefinition {
  id: string;
  name: string;
  values: string[];
  schemaId?: string;
  position?: { x: number; y: number };
  comment?: string;
}

export interface Column {
  id: string;
  name: string;
  type: DataType;
  length?: number;
  precision?: number;
  scale?: number;
  enumName?: string;
  isPrimaryKey: boolean;
  isNullable: boolean;
  isUnique: boolean;
  isIndexed?: boolean;
  isAutoIncrement?: boolean;
  defaultValue?: string;
  comment?: string;
  foreignKey?: ForeignKeyReference;
}

export interface Table {
  id: string;
  name: string;
  schemaId?: string;
  columns: Column[];
  indexes?: IndexDefinition[];
  position: { x: number; y: number };
  comment?: string;
  color?: string;
}

export interface SchemaGroup {
  id: string;
  name: string;
  color: string;
  position?: { x: number; y: number };
  comment?: string;
}

export type DatabaseEngine = 'postgresql' | 'mysql' | 'sqlite';

export interface DatabaseProject {
  id: string;
  name: string;
  engine: DatabaseEngine;
  schemas: SchemaGroup[];
  enums: EnumDefinition[];
  tables: Table[];
}

export type ORMTarget = 'prisma' | 'drizzle' | 'mikroorm' | 'typeorm' | 'sql';

export type CanvasViewMode = 'all_tables' | 'single_schema' | 'schemas_overview';
