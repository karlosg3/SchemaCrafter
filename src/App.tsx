import { useState, useCallback, useEffect, useRef } from 'react';
import type { DatabaseProject, Table, Column, DatabaseEngine, SchemaGroup, CanvasViewMode, EnumDefinition } from './types/schema';
import {
  loadProjectsFromStorage,
  saveProjectsToStorage,
  getActiveDbIdFromStorage,
  setActiveDbIdInStorage
} from './utils/storage';
import { SchemaCanvas } from './components/canvas/SchemaCanvas';
import { CodePreviewPanel } from './components/editor/CodePreviewPanel';
import { HeaderToolbar } from './components/editor/HeaderToolbar';
import { DatabaseLeftSidebar } from './components/editor/DatabaseLeftSidebar';
import { TableModal } from './components/editor/TableModal';
import { ColumnModal } from './components/editor/ColumnModal';
import { ImportModal } from './components/editor/ImportModal';
import { SchemaModal } from './components/editor/SchemaModal';
import { DatabaseModal } from './components/editor/DatabaseModal';
import { EnumModal } from './components/editor/EnumModal';
import { ConfirmModal } from './components/editor/ConfirmModal';

export function App() {
  // All projects loaded from LocalStorage
  const [projects, setProjects] = useState<DatabaseProject[]>(() => loadProjectsFromStorage());
  const [activeProjectId, setActiveProjectId] = useState<string>(() => getActiveDbIdFromStorage(projects));

  // Current active project
  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0];

  // Canvas View Mode: 'all_tables' | 'single_schema' | 'schemas_overview'
  const [viewMode, setViewMode] = useState<CanvasViewMode>('all_tables');
  const [selectedSchemaId, setSelectedSchemaId] = useState<string | null>(null);

  const selectedSchemaName = activeProject.schemas.find((s) => s.id === selectedSchemaId)?.name;

  // Auto-save to LocalStorage whenever projects change
  useEffect(() => {
    saveProjectsToStorage(projects);
  }, [projects]);

  useEffect(() => {
    setActiveDbIdInStorage(activeProjectId);
  }, [activeProjectId]);

  // Sidebar & Panel toggles and resizable widths
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showCodePreview, setShowCodePreview] = useState(true);

  const [sidebarWidth, setSidebarWidth] = useState(288); // Default 288px
  const [codePanelWidth, setCodePanelWidth] = useState(540); // Default 540px

  const isResizingLeftRef = useRef(false);
  const isResizingRightRef = useRef(false);

  // Resize Left Sidebar handler
  const handleLeftResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingLeftRef.current = true;
    document.body.style.cursor = 'col-resize';

    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizingLeftRef.current) return;
      const newWidth = Math.max(200, Math.min(500, event.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizingLeftRef.current = false;
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, []);

  // Resize Right Code Panel handler
  const handleRightResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRightRef.current = true;
    document.body.style.cursor = 'col-resize';

    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizingRightRef.current) return;
      const newWidth = Math.max(320, Math.min(800, window.innerWidth - event.clientX));
      setCodePanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizingRightRef.current = false;
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, []);

  // Modals state
  const [tableModalData, setTableModalData] = useState<{ isOpen: boolean; table?: Table }>({ isOpen: false });
  const [columnModalData, setColumnModalData] = useState<{ isOpen: boolean; tableId: string; column?: Column }>({ isOpen: false, tableId: '' });
  const [schemaModalData, setSchemaModalData] = useState<{ isOpen: boolean; schema?: SchemaGroup }>({ isOpen: false });
  const [enumModalData, setEnumModalData] = useState<{ isOpen: boolean; enumDef?: EnumDefinition }>({ isOpen: false });
  const [databaseModalData, setDatabaseModalData] = useState<{ isOpen: boolean; project?: DatabaseProject }>({ isOpen: false });
  const [confirmModalData, setConfirmModalData] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Project Level Handlers
  const handleUpdateActiveProject = useCallback((updater: (prevProj: DatabaseProject) => DatabaseProject) => {
    setProjects((prevProjects) =>
      prevProjects.map((p) => (p.id === activeProjectId ? updater(p) : p))
    );
  }, [activeProjectId]);

  const handleCreateDatabase = useCallback((name: string, engine: DatabaseEngine) => {
    const newDb: DatabaseProject = {
      id: `project-${Date.now()}`,
      name,
      engine,
      schemas: [{ id: `schema-public-${Date.now()}`, name: 'public', color: '#6366f1' }],
      enums: [],
      tables: []
    };
    setProjects((prev) => [...prev, newDb]);
    setActiveProjectId(newDb.id);
  }, []);

  const handleEditDatabase = useCallback((name: string, engine: DatabaseEngine) => {
    handleUpdateActiveProject((prev) => ({ ...prev, name, engine }));
  }, [handleUpdateActiveProject]);

  const handleDeleteDatabase = useCallback((projectId: string) => {
    if (projects.length <= 1) return;
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    if (activeProjectId === projectId) {
      const remaining = projects.filter((p) => p.id !== projectId);
      setActiveProjectId(remaining[0].id);
    }
  }, [projects, activeProjectId]);

  // Schema Handlers
  const handleSaveSchema = useCallback((schema: SchemaGroup) => {
    handleUpdateActiveProject((prev) => {
      const exists = prev.schemas.some((s) => s.id === schema.id);
      const updatedSchemas = exists
        ? prev.schemas.map((s) => (s.id === schema.id ? schema : s))
        : [...prev.schemas, schema];
      return { ...prev, schemas: updatedSchemas };
    });
  }, [handleUpdateActiveProject]);

  const handleDeleteSchema = useCallback((schemaId: string) => {
    handleUpdateActiveProject((prev) => ({
      ...prev,
      schemas: prev.schemas.filter((s) => s.id !== schemaId),
      tables: prev.tables.map((t) => (t.schemaId === schemaId ? { ...t, schemaId: undefined } : t))
    }));
    if (selectedSchemaId === schemaId) {
      setSelectedSchemaId(null);
      setViewMode('all_tables');
    }
  }, [handleUpdateActiveProject, selectedSchemaId]);

  // Enum Handlers
  const handleSaveEnum = useCallback((enumDef: EnumDefinition) => {
    handleUpdateActiveProject((prev) => {
      const existing = prev.enums || [];
      const exists = existing.some((e) => e.id === enumDef.id);
      const updatedEnums = exists
        ? existing.map((e) => (e.id === enumDef.id ? enumDef : e))
        : [...existing, enumDef];
      return { ...prev, enums: updatedEnums };
    });
  }, [handleUpdateActiveProject]);

  const handleDeleteEnum = useCallback((enumId: string) => {
    handleUpdateActiveProject((prev) => ({
      ...prev,
      enums: (prev.enums || []).filter((e) => e.id !== enumId)
    }));
  }, [handleUpdateActiveProject]);

  // Tables Handlers
  const handleUpdateTables = useCallback((tables: Table[]) => {
    handleUpdateActiveProject((prev) => ({ ...prev, tables }));
  }, [handleUpdateActiveProject]);

  const handleAddTable = useCallback(() => {
    const tableId = `table-${Date.now()}`;
    const targetSchemaId = selectedSchemaId || activeProject.schemas[0]?.id;
    const newTable: Table = {
      id: tableId,
      name: `new_table_${activeProject.tables.length + 1}`,
      schemaId: targetSchemaId,
      position: { x: 250 + (activeProject.tables.length % 3) * 350, y: 150 + Math.floor(activeProject.tables.length / 3) * 300 },
      color: activeProject.schemas.find(s => s.id === targetSchemaId)?.color || '#6366f1',
      columns: [
        {
          id: `${tableId}-id`,
          name: 'id',
          type: 'UUID',
          isPrimaryKey: true,
          isNullable: false,
          isUnique: true,
          defaultValue: 'gen_random_uuid()'
        }
      ]
    };
    handleUpdateActiveProject((prev) => ({ ...prev, tables: [...prev.tables, newTable] }));
  }, [activeProject.tables.length, activeProject.schemas, selectedSchemaId, handleUpdateActiveProject]);

  const handleSaveTableProperties = useCallback((updatedTable: Table) => {
    handleUpdateActiveProject((prev) => ({
      ...prev,
      tables: prev.tables.map((t) => (t.id === updatedTable.id ? updatedTable : t))
    }));
  }, [handleUpdateActiveProject]);

  const handleDeleteTable = useCallback((tableId: string) => {
    handleUpdateActiveProject((prev) => ({
      ...prev,
      tables: prev.tables
        .filter((t) => t.id !== tableId)
        .map((t) => ({
          ...t,
          columns: t.columns.map((col) => {
            if (col.foreignKey?.targetTableId === tableId) {
              return { ...col, foreignKey: undefined };
            }
            return col;
          })
        }))
    }));
  }, [handleUpdateActiveProject]);

  // Column Handlers
  const handleSaveColumnProperties = useCallback((savedColumn: Column) => {
    handleUpdateActiveProject((prev) => ({
      ...prev,
      tables: prev.tables.map((tbl) => {
        if (tbl.id === columnModalData.tableId) {
          const exists = tbl.columns.some((c) => c.id === savedColumn.id);
          const updatedCols = exists
            ? tbl.columns.map((c) => (c.id === savedColumn.id ? savedColumn : c))
            : [...tbl.columns, savedColumn];
          return { ...tbl, columns: updatedCols };
        }
        return tbl;
      })
    }));
  }, [columnModalData.tableId, handleUpdateActiveProject]);

  const handleDeleteColumn = useCallback((tableId: string, columnId: string) => {
    handleUpdateActiveProject((prev) => ({
      ...prev,
      tables: prev.tables.map((tbl) => {
        if (tbl.id === tableId) {
          return {
            ...tbl,
            columns: tbl.columns.filter((c) => c.id !== columnId)
          };
        }
        return tbl;
      })
    }));
  }, [handleUpdateActiveProject]);

  // Auto Layout
  const handleAutoLayout = useCallback(() => {
    let x = 80;
    let y = 80;
    const repositioned = activeProject.tables.map((t) => {
      const pos = { x, y };
      x += 380;
      if (x > 1100) {
        x = 80;
        y += 340;
      }
      return { ...t, position: pos };
    });
    handleUpdateActiveProject((prev) => ({ ...prev, tables: repositioned }));
  }, [activeProject.tables, handleUpdateActiveProject]);

  // Export JSON
  const handleExportJson = useCallback(() => {
    const jsonStr = JSON.stringify(activeProject, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeProject.name.toLowerCase().replace(/\s+/g, '_')}_schema.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeProject]);

  return (
    <div className="w-screen h-screen flex flex-col bg-slate-950 overflow-hidden text-slate-100 antialiased font-sans">
      {/* Header Bar */}
      <HeaderToolbar
        project={activeProject}
        viewMode={viewMode}
        onChangeViewMode={(mode) => {
          setViewMode(mode);
          if (mode === 'all_tables') setSelectedSchemaId(null);
        }}
        selectedSchemaName={selectedSchemaName}
        onUpdateProjectName={(name) => handleUpdateActiveProject((p) => ({ ...p, name }))}
        onAddTable={handleAddTable}
        onAddSchema={() => setSchemaModalData({ isOpen: true })}
        onLoadTemplate={(template) => {
          setProjects((prev) => prev.map((p) => (p.id === activeProjectId ? { ...template, id: activeProjectId } : p)));
        }}
        onOpenImportModal={() => setIsImportModalOpen(true)}
        onExportJson={handleExportJson}
        onAutoLayout={handleAutoLayout}
        showCodePreview={showCodePreview}
        onToggleCodePreview={() => setShowCodePreview(!showCodePreview)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Neon DB Style Resizable Left Sidebar */}
        <DatabaseLeftSidebar
          projects={projects}
          activeProject={activeProject}
          onSelectProject={(id) => {
            setActiveProjectId(id);
            setSelectedSchemaId(null);
            setViewMode('all_tables');
          }}
          onCreateProject={() => setDatabaseModalData({ isOpen: true })}
          onEditProject={(p) => setDatabaseModalData({ isOpen: true, project: p })}
          onDeleteProject={(id) => {
            setConfirmModalData({
              isOpen: true,
              title: 'Delete Database Project',
              message: 'Are you sure you want to delete this database project? This action cannot be undone.',
              onConfirm: () => handleDeleteDatabase(id)
            });
          }}
          selectedSchemaFilter={selectedSchemaId}
          onSelectSchemaFilter={(schemaId) => {
            setSelectedSchemaId(schemaId);
            if (schemaId) {
              setViewMode('single_schema');
            } else {
              setViewMode('all_tables');
            }
          }}
          onCreateSchema={() => setSchemaModalData({ isOpen: true })}
          onEditSchema={(schema) => setSchemaModalData({ isOpen: true, schema })}
          onDeleteSchema={(id) => {
            setConfirmModalData({
              isOpen: true,
              title: 'Delete Schema Group',
              message: 'Are you sure you want to delete this schema group? Tables under this schema will remain intact.',
              onConfirm: () => handleDeleteSchema(id)
            });
          }}
          onCreateEnum={() => setEnumModalData({ isOpen: true })}
          onEditEnum={(enumDef) => setEnumModalData({ isOpen: true, enumDef })}
          onDeleteEnum={(id) => {
            setConfirmModalData({
              isOpen: true,
              title: 'Delete Enum Type',
              message: 'Are you sure you want to delete this enum type?',
              onConfirm: () => handleDeleteEnum(id)
            });
          }}
          isOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          width={sidebarWidth}
          onStartResize={handleLeftResizeStart}
        />

        {/* Canvas Area */}
        <div className="flex-1 h-full relative">
          <SchemaCanvas
            project={activeProject}
            viewMode={viewMode}
            selectedSchemaId={selectedSchemaId}
            onInspectSchema={(schemaId) => {
              setSelectedSchemaId(schemaId);
              setViewMode('single_schema');
            }}
            onUpdateTables={handleUpdateTables}
            onEditTable={(table) => setTableModalData({ isOpen: true, table })}
            onDeleteTable={(id) => {
              setConfirmModalData({
                isOpen: true,
                title: 'Delete Table',
                message: 'Are you sure you want to delete this table? All foreign keys referencing it will be removed.',
                onConfirm: () => handleDeleteTable(id)
              });
            }}
            onAddColumn={(tableId) => setColumnModalData({ isOpen: true, tableId })}
            onEditColumn={(tableId, column) => setColumnModalData({ isOpen: true, tableId, column })}
            onDeleteColumn={handleDeleteColumn}
            onEditEnum={(enumDef) => setEnumModalData({ isOpen: true, enumDef })}
            onDeleteEnum={(id) => {
              setConfirmModalData({
                isOpen: true,
                title: 'Delete Enum Type',
                message: 'Are you sure you want to delete this enum type?',
                onConfirm: () => handleDeleteEnum(id)
              });
            }}
          />
        </div>

        {/* ORM Code Preview & Live Editor Resizable Right Panel */}
        <div
          style={{ width: showCodePreview ? `${codePanelWidth}px` : '0px' }}
          className={`h-full shadow-2xl z-10 transition-[width] duration-150 ease-out overflow-hidden relative ${
            showCodePreview ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full pointer-events-none'
          }`}
        >
          <CodePreviewPanel
            project={activeProject}
            onEngineChange={(engine) => handleUpdateActiveProject((p) => ({ ...p, engine }))}
            onCodeProjectSync={(updatedProject) => {
              setProjects((prev) => prev.map((p) => (p.id === activeProjectId ? updatedProject : p)));
            }}
            onStartResize={handleRightResizeStart}
          />
        </div>
      </div>

      {/* Modals */}
      {tableModalData.isOpen && tableModalData.table && (
        <TableModal
          table={tableModalData.table}
          schemas={activeProject.schemas}
          isOpen={tableModalData.isOpen}
          onClose={() => setTableModalData({ isOpen: false })}
          onSave={handleSaveTableProperties}
        />
      )}

      {columnModalData.isOpen && (
        <ColumnModal
          column={columnModalData.column}
          tables={activeProject.tables}
          currentTableId={columnModalData.tableId}
          isOpen={columnModalData.isOpen}
          onClose={() => setColumnModalData({ isOpen: false, tableId: '' })}
          onSave={handleSaveColumnProperties}
        />
      )}

      {schemaModalData.isOpen && (
        <SchemaModal
          schema={schemaModalData.schema}
          isOpen={schemaModalData.isOpen}
          onClose={() => setSchemaModalData({ isOpen: false })}
          onSave={handleSaveSchema}
        />
      )}

      {enumModalData.isOpen && (
        <EnumModal
          enumDef={enumModalData.enumDef}
          isOpen={enumModalData.isOpen}
          onClose={() => setEnumModalData({ isOpen: false })}
          onSave={handleSaveEnum}
        />
      )}

      {databaseModalData.isOpen && (
        <DatabaseModal
          project={databaseModalData.project}
          isOpen={databaseModalData.isOpen}
          onClose={() => setDatabaseModalData({ isOpen: false })}
          onSave={(name, engine) => {
            if (databaseModalData.project) {
              handleEditDatabase(name, engine);
            } else {
              handleCreateDatabase(name, engine);
            }
          }}
        />
      )}

      <ConfirmModal
        title={confirmModalData.title}
        message={confirmModalData.message}
        isOpen={confirmModalData.isOpen}
        onClose={() => setConfirmModalData((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModalData.onConfirm}
      />

      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportTables={(importedTables) => {
          handleUpdateActiveProject((prev) => ({
            ...prev,
            tables: [...prev.tables, ...importedTables]
          }));
        }}
      />
    </div>
  );
}

export default App;
