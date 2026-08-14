import React, { useState } from 'react';
import {
  Database,
  Plus,
  Layers,
  Download,
  FolderOpen,
  LayoutGrid,
  PanelRightClose,
  PanelRightOpen,
  FileUp,
  Globe,
  Folder,
  Boxes
} from 'lucide-react';
import type { DatabaseProject, CanvasViewMode } from '../../types/schema';
import { ECOMMERCE_TEMPLATE, SAAS_TEMPLATE } from '../../utils/templates';

interface HeaderToolbarProps {
  project: DatabaseProject;
  viewMode: CanvasViewMode;
  onChangeViewMode: (mode: CanvasViewMode) => void;
  selectedSchemaName?: string;
  onUpdateProjectName: (name: string) => void;
  onAddTable: () => void;
  onAddSchema: () => void;
  onLoadTemplate: (template: DatabaseProject) => void;
  onOpenImportModal: () => void;
  onExportJson: () => void;
  onAutoLayout: () => void;
  showCodePreview: boolean;
  onToggleCodePreview: () => void;
}

export const HeaderToolbar: React.FC<HeaderToolbarProps> = ({
  project,
  viewMode,
  onChangeViewMode,
  selectedSchemaName,
  onUpdateProjectName,
  onAddTable,
  onAddSchema,
  onLoadTemplate,
  onOpenImportModal,
  onExportJson,
  onAutoLayout,
  showCodePreview,
  onToggleCodePreview
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(project.name);

  const handleNameSubmit = () => {
    setIsEditingName(false);
    if (nameInput.trim()) {
      onUpdateProjectName(nameInput.trim());
    }
  };

  return (
    <header className="h-16 px-5 bg-slate-900 border-b border-slate-800 flex items-center justify-between shadow-xl z-20 select-none">
      {/* Brand & Project Title */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25">
            <Database size={20} />
          </div>
          <div>
            <h1 className="font-bold text-sm text-slate-100 tracking-tight flex items-center gap-2">
              SchemaCrafter
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono border border-indigo-500/30">
                ORM Playground
              </span>
            </h1>

            {isEditingName ? (
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onBlur={handleNameSubmit}
                onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
                autoFocus
                className="bg-slate-950 border border-indigo-500 px-2 py-0.5 rounded text-xs font-semibold text-slate-200 outline-none"
              />
            ) : (
              <p
                onClick={() => setIsEditingName(true)}
                title="Click to rename project"
                className="text-xs text-slate-400 font-medium cursor-pointer hover:text-indigo-300 transition-colors"
              >
                {project.name}
              </p>
            )}
          </div>
        </div>

        {/* View Mode Segmented Controls */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-medium">
          <button
            onClick={() => onChangeViewMode('all_tables')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all ${
              viewMode === 'all_tables'
                ? 'bg-indigo-600 text-white shadow-md font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Show all tables across all schemas"
          >
            <Globe size={13} />
            All Tables
          </button>

          <button
            onClick={() => onChangeViewMode('single_schema')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all ${
              viewMode === 'single_schema'
                ? 'bg-purple-600 text-white shadow-md font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Filter tables by specific schema"
          >
            <Folder size={13} />
            {selectedSchemaName ? `Schema: ${selectedSchemaName}` : 'By Schema'}
          </button>

          <button
            onClick={() => onChangeViewMode('schemas_overview')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all ${
              viewMode === 'schemas_overview'
                ? 'bg-amber-600 text-white shadow-md font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Show high-level schema blocks and inter-schema relations"
          >
            <Boxes size={13} />
            Schemas Blocks
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 text-xs">
        {/* Add Table */}
        <button
          onClick={onAddTable}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-md shadow-indigo-600/25 transition-all"
        >
          <Plus size={15} />
          Add Table
        </button>

        {/* Add Schema */}
        <button
          onClick={onAddSchema}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 font-medium border border-slate-700 transition-colors"
        >
          <Layers size={15} className="text-purple-400" />
          Add Schema
        </button>

        {/* Auto Layout */}
        <button
          onClick={onAutoLayout}
          title="Auto arrange tables on grid"
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 transition-colors"
        >
          <LayoutGrid size={15} />
        </button>

        <div className="h-5 w-[1px] bg-slate-800 my-auto mx-1" />

        {/* Preset Templates */}
        <div className="relative group">
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 font-medium border border-slate-700 transition-colors">
            <FolderOpen size={15} className="text-amber-400" />
            Templates
          </button>
          <div className="absolute right-0 top-full mt-1.5 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1.5 hidden group-hover:block z-50">
            <button
              onClick={() => onLoadTemplate(ECOMMERCE_TEMPLATE)}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800 text-slate-200 transition-colors"
            >
              E-Commerce Store
            </button>
            <button
              onClick={() => onLoadTemplate(SAAS_TEMPLATE)}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800 text-slate-200 transition-colors"
            >
              SaaS Subscriptions
            </button>
            <button
              onClick={() =>
                onLoadTemplate({
                  id: `project-${Date.now()}`,
                  name: 'New Database Project',
                  engine: 'postgresql',
                  schemas: [],
                  enums: [],
                  tables: []
                })
              }
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors border-t border-slate-800 mt-1 pt-2"
            >
              Clear Canvas (Blank)
            </button>
          </div>
        </div>

        {/* Import SQL */}
        <button
          onClick={onOpenImportModal}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 font-medium border border-slate-700 transition-colors"
        >
          <FileUp size={15} className="text-cyan-400" />
          Import SQL
        </button>

        {/* Export JSON */}
        <button
          onClick={onExportJson}
          title="Export Schema JSON"
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 transition-colors"
        >
          <Download size={15} />
        </button>

        <div className="h-5 w-[1px] bg-slate-800 my-auto mx-1" />

        {/* Code Preview Toggle */}
        <button
          onClick={onToggleCodePreview}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-medium transition-all ${
            showCodePreview
              ? 'bg-indigo-600/20 border border-indigo-500/40 text-indigo-300'
              : 'bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300'
          }`}
        >
          {showCodePreview ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
          Code View
        </button>
      </div>
    </header>
  );
};
