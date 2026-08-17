import type { DatabaseProject, ORMTarget } from '../types/schema';
import { generatePrismaSchema } from './prisma';
import { generateDrizzleSchema } from './drizzle';
import { generateMikroOrmSchema } from './mikroorm';
import { generateTypeOrmSchema } from './typeorm';
import { generateSqlDdl } from './sql';

export function generateCodeForTarget(project: DatabaseProject, target: ORMTarget): string {
  switch (target) {
    case 'prisma':
      return generatePrismaSchema(project);
    case 'drizzle':
      return generateDrizzleSchema(project);
    case 'mikroorm':
      return generateMikroOrmSchema(project);
    case 'typeorm':
      return generateTypeOrmSchema(project);
    case 'sql':
      return generateSqlDdl(project);
    default:
      return generatePrismaSchema(project);
  }
}
