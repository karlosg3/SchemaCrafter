import type { DatabaseProject, ORMTarget } from '../../types/schema';
import { parsePrismaToProject } from './prismaParser';
import { parseSqlToProject } from './sqlParser';
import { parseDrizzleToProject } from './drizzleParser';
import { parseMikroOrmToProject } from './mikroormParser';

export function parseCodeToProject(
  codeText: string,
  target: ORMTarget,
  currentProject: DatabaseProject
): DatabaseProject {
  switch (target) {
    case 'prisma':
      return parsePrismaToProject(codeText, currentProject);
    case 'sql':
      return parseSqlToProject(codeText, currentProject);
    case 'mikroorm':
    case 'typeorm':
      return parseMikroOrmToProject(codeText, currentProject);
    case 'drizzle':
      return parseDrizzleToProject(codeText, currentProject);
    default:
      return parsePrismaToProject(codeText, currentProject);
  }
}
