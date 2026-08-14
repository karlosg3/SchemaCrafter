import React, { useState } from 'react';
import {
  Database,
  Layers,
  Table as TableIcon,
  Plus,
  ChevronRight,
  ChevronDown,
  Search,
  CheckCircle2,
  Trash2,
  Edit2,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  Tag
} from 'lucide-react';
import type { DatabaseProject, SchemaGroup, EnumDefinition } from '../../types/schema';

interface DatabaseLeftSidebarProps {
  projects: DatabaseProject[];
  activeProject: DatabaseProject;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  onEditProject: (project: DatabaseProject) => void;
  onDeleteProject: (projectId: string) => void;

  selectedSchemaFilter: string | null;
  onSelectSchemaFilter: (schemaId: string | null) => void;
  onCreateSchema: () => void;
  onEditSchema: (schema: SchemaGroup) => void;
  onDeleteSchema: (schemaId: string) => void;

  onCreateEnum?: () => void;
  onEditEnum?: (enumDef: EnumDefinition) => void;
  onDeleteEnum?: (enumId: string) => void;

  isOpen: boolean;
  onToggleSidebar: () => void;

  width?: number;
  onStartResize?: (e: React.MouseEvent) => void;
}

export const DatabaseLeftSidebar: React.FC<DatabaseLeftSidebarProps> = ({
  projects,
  activeProject,
  onSelectProject,
  onCreateProject,
  onEditProject,
  onDeleteProject,
  selectedSchemaFilter,
  onSelectSchemaFilter,
  onCreateSchema,
  onEditSchema,
  onDeleteSchema,
  onCreateEnum,
  onEditEnum,
  onDeleteEnum,
  isOpen,
  onToggleSidebar,
  width = 288,
  onStartResize
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [databasesExpanded, setDatabasesExpanded] = useState(true);
  const [schemasExpanded, setSchemasExpanded] = useState(true);
  const [enumsExpanded, setEnumsExpanded] = useState(true);

  const filteredTables = activeProject.tables.filter((t) => {
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSchema = !selectedSchemaFilter || t.schemaId === selectedSchemaFilter;
    return matchesSearch && matchesSchema;
  });

  const projectEnums = activeProject.enums || [];

  return (
    <aside
      style={{ width: isOpen ? `${width}px` : '56px' }}
      className="h-full bg-slate-900/95 backdrop-blur-xl border-r border-slate-800 flex flex-col z-20 shadow-2xl transition-[width] duration-150 ease-out select-none overflow-hidden relative group/sidebar"
    >
      {/* Resizable Width Drag Handle */}
      {isOpen && onStartResize && (
        <div
          onMouseDown={onStartResize}
          title="Drag to resize left sidebar width"
          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-500/50 active:bg-indigo-500 transition-colors z-30 flex items-center justify-center group-hover/sidebar:bg-slate-700/50"
        />
      )}

      {/* Sidebar Header */}
      <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70 min-h-[57px]">
        {isOpen ? (
          <>
            <div className="flex items-center gap-2 overflow-hidden transition-opacity duration-300">
              <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
                <Database size={16} />
              </div>
              <span className="font-semibold text-xs text-slate-200 tracking-wide truncate">
                Database Explorer
              </span>
            </div>

            <button
              onClick={onToggleSidebar}
              title="Collapse Sidebar"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <PanelLeftClose size={16} />
            </button>
          </>
        ) : (
          <button
            onClick={onToggleSidebar}
            title="Open Database Explorer"
            className="w-full flex items-center justify-center p-1.5 rounded-lg text-indigo-400 hover:bg-indigo-600/20 transition-all"
          >
            <PanelLeftOpen size={18} />
          </button>
        )}
      </div>

      {/* Expanded Sidebar Content */}
      {isOpen && (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4 text-xs transition-opacity duration-300">
          {/* Databases / Projects Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => setDatabasesExpanded(!databasesExpanded)}
                className="flex items-center gap-1.5 font-semibold text-[11px] text-slate-400 uppercase tracking-wider hover:text-slate-200 transition-colors"
              >
                {databasesExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Databases ({projects.length})
              </button>
              <button
                onClick={onCreateProject}
                title="Create New Database"
                className="p-1 rounded bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white transition-all"
              >
                <Plus size={13} />
              </button>
            </div>

            {databasesExpanded && (
              <div className="space-y-1 pl-1">
                {projects.map((p) => {
                  const isActive = p.id === activeProject.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => onSelectProject(p.id)}
                      className={`group flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer border transition-all ${
                        isActive
                          ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-200 shadow-md font-semibold'
                          : 'bg-slate-950/60 hover:bg-slate-800/80 border-slate-800/60 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <Database size={14} className={isActive ? 'text-indigo-400' : 'text-slate-400'} />
                        <span className="truncate">{p.name}</span>
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400 font-mono">
                          {p.engine === 'postgresql' ? 'PG' : p.engine === 'mysql' ? 'MY' : 'SL'}
                        </span>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditProject(p);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-indigo-300 transition-opacity"
                          title="Edit Database"
                        >
                          <Edit2 size={12} />
                        </button>

                        {projects.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteProject(p.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-400 transition-opacity"
                            title="Delete Database"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Schemas Breakdown */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => setSchemasExpanded(!schemasExpanded)}
                className="flex items-center gap-1.5 font-semibold text-[11px] text-slate-400 uppercase tracking-wider hover:text-slate-200 transition-colors"
              >
                {schemasExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Schemas ({activeProject.schemas.length})
              </button>
              <button
                onClick={onCreateSchema}
                title="Create Schema"
                className="p-1 rounded bg-slate-800 hover:bg-purple-600 text-slate-300 hover:text-white transition-all"
              >
                <Plus size={13} />
              </button>
            </div>

            {schemasExpanded && (
              <div className="space-y-1 pl-1">
                <div
                  onClick={() => onSelectSchemaFilter(null)}
                  className={`flex items-center justify-between px-3 py-1.5 rounded-lg cursor-pointer transition-all ${
                    selectedSchemaFilter === null
                      ? 'bg-purple-600/20 border border-purple-500/40 text-purple-200 font-semibold'
                      : 'hover:bg-slate-800 text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Layers size={13} className="text-purple-400" />
                    <span>All Schemas</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">
                    {activeProject.tables.length} tables
                  </span>
                </div>

                {activeProject.schemas.map((s) => {
                  const isSelected = selectedSchemaFilter === s.id;
                  const tableCount = activeProject.tables.filter((t) => t.schemaId === s.id).length;
                  return (
                    <div
                      key={s.id}
                      onClick={() => onSelectSchemaFilter(s.id)}
                      className={`group flex items-center justify-between px-3 py-1.5 rounded-lg cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-purple-600/20 border border-purple-500/40 text-purple-200 font-semibold'
                          : 'hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <div
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: s.color }}
                        />
                        <span className="truncate font-mono">{s.name}</span>
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-mono text-slate-500">{tableCount}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditSchema(s);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-purple-300 transition-opacity"
                          title="Edit Schema"
                        >
                          <Edit2 size={11} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSchema(s.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-rose-400 transition-opacity"
                          title="Delete Schema"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Enums Breakdown Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => setEnumsExpanded(!enumsExpanded)}
                className="flex items-center gap-1.5 font-semibold text-[11px] text-slate-400 uppercase tracking-wider hover:text-slate-200 transition-colors"
              >
                {enumsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Enums ({projectEnums.length})
              </button>
              {onCreateEnum && (
                <button
                  onClick={onCreateEnum}
                  title="Create Enum"
                  className="p-1 rounded bg-slate-800 hover:bg-pink-600 text-slate-300 hover:text-white transition-all"
                >
                  <Plus size={13} />
                </button>
              )}
            </div>

            {enumsExpanded && (
              <div className="space-y-1 pl-1">
                {projectEnums.map((eDef) => (
                  <div
                    key={eDef.id}
                    className="group flex items-center justify-between px-3 py-1.5 rounded-lg hover:bg-slate-800 text-pink-300 font-mono text-[11px] transition-colors"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <Tag size={13} className="text-pink-400 flex-shrink-0" />
                      <span className="truncate">{eDef.name}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-500 font-mono">{eDef.values.length} opts</span>
                      {onEditEnum && (
                        <button
                          onClick={() => onEditEnum(eDef)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-pink-300 transition-opacity"
                          title="Edit Enum"
                        >
                          <Edit2 size={11} />
                        </button>
                      )}
                      {onDeleteEnum && (
                        <button
                          onClick={() => onDeleteEnum(eDef.id)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-rose-400 transition-opacity"
                          title="Delete Enum"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {projectEnums.length === 0 && (
                  <p className="text-[11px] text-slate-500 p-1 italic text-center">No enums defined</p>
                )}
              </div>
            )}
          </div>

          {/* Tables Search & Hierarchy */}
          <div>
            <div className="relative mb-2">
              <Search size={13} className="absolute left-2.5 top-2.5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tables..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs outline-none focus:border-indigo-500 transition-all font-mono"
              />
            </div>

            <div className="space-y-1 pl-1">
              {filteredTables.map((tbl) => (
                <div
                  key={tbl.id}
                  className="flex items-center justify-between px-3 py-1.5 rounded-lg hover:bg-slate-800/80 text-slate-300 font-mono transition-colors text-[11px]"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <TableIcon size={13} className="text-cyan-400 flex-shrink-0" />
                    <span className="truncate">{tbl.name}</span>
                  </div>
                  <span className="text-[10px] text-slate-500">{tbl.columns.length} cols</span>
                </div>
              ))}
              {filteredTables.length === 0 && (
                <p className="text-[11px] text-slate-500 p-2 italic text-center">No tables found</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Collapsed Sidebar Quick Icons */}
      {!isOpen && (
        <div className="flex-1 flex flex-col items-center py-4 gap-4 text-slate-400">
          <button
            onClick={onToggleSidebar}
            title="Databases"
            className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-indigo-400 transition-colors"
          >
            <Database size={18} />
          </button>
          <button
            onClick={onToggleSidebar}
            title="Schemas"
            className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-purple-400 transition-colors"
          >
            <Layers size={18} />
          </button>
          <button
            onClick={onToggleSidebar}
            title="Enums"
            className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-pink-400 transition-colors"
          >
            <Tag size={18} />
          </button>
        </div>
      )}

      {/* Footer LocalStorage Status Indicator */}
      {isOpen && (
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/80 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={13} className="text-emerald-400" />
            <span>Auto-saved locally</span>
          </div>
          <Sparkles size={13} className="text-indigo-400" />
        </div>
      )}
    </aside>
  );
};
