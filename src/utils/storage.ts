import type { DatabaseProject } from '../types/schema';
import { ECOMMERCE_TEMPLATE, SAAS_TEMPLATE } from './templates';

const STORAGE_KEY = 'schemacrafter_database_projects_v1';
const ACTIVE_DB_KEY = 'schemacrafter_active_db_id_v1';

export function loadProjectsFromStorage(): DatabaseProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = [ECOMMERCE_TEMPLATE, SAAS_TEMPLATE];
      saveProjectsToStorage(initial);
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return [ECOMMERCE_TEMPLATE, SAAS_TEMPLATE];
  } catch (err) {
    console.error('Failed to load projects from localStorage:', err);
    return [ECOMMERCE_TEMPLATE, SAAS_TEMPLATE];
  }
}

export function saveProjectsToStorage(projects: DatabaseProject[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch (err) {
    console.error('Failed to save projects to localStorage:', err);
  }
}

export function getActiveDbIdFromStorage(projects: DatabaseProject[]): string {
  try {
    const activeId = localStorage.getItem(ACTIVE_DB_KEY);
    if (activeId && projects.some(p => p.id === activeId)) {
      return activeId;
    }
  } catch (err) {
    console.error('Failed to get active DB ID:', err);
  }
  return projects[0]?.id || ECOMMERCE_TEMPLATE.id;
}

export function setActiveDbIdInStorage(id: string): void {
  try {
    localStorage.setItem(ACTIVE_DB_KEY, id);
  } catch (err) {
    console.error('Failed to save active DB ID:', err);
  }
}
