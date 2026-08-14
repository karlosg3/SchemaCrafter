import React, { useState } from 'react';
import { X, Key, Lock, Tag, Hash } from 'lucide-react';
import type { Column, DataType, Table, ForeignKeyAction } from '../../types/schema';

interface ColumnModalProps {
  column?: Column;
  tables: Table[];
  currentTableId: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: (column: Column) => void;
}

export const ColumnModal: React.FC<ColumnModalProps> = ({
  column,
  tables,
  currentTableId,
  isOpen,
  onClose,
  onSave
}) => {
  const [name, setName] = useState(column?.name || '');
  const [type, setType] = useState<DataType>(column?.type || 'VARCHAR');
  const [enumName, setEnumName] = useState(column?.enumName || '');
  const [isPrimaryKey, setIsPrimaryKey] = useState(column?.isPrimaryKey || false);
  const [isNullable, setIsNullable] = useState(column?.isNullable ?? true);
  const [isUnique, setIsUnique] = useState(column?.isUnique || false);
  const [isIndexed, setIsIndexed] = useState(column?.isIndexed || false);
  const [isAutoIncrement] = useState(column?.isAutoIncrement || false);
  const [defaultValue, setDefaultValue] = useState(column?.defaultValue || '');

  // Foreign Key state
  const [hasFk, setHasFk] = useState(Boolean(column?.foreignKey));
  const [fkTargetTableId, setFkTargetTableId] = useState(column?.foreignKey?.targetTableId || '');
  const [fkTargetColumnId, setFkTargetColumnId] = useState(column?.foreignKey?.targetColumnId || '');
  const [fkOnDelete] = useState<ForeignKeyAction>(column?.foreignKey?.onDelete || 'CASCADE');

  if (!isOpen) return null;

  const targetTable = tables.find((t) => t.id === fkTargetTableId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    let fkData = undefined;
    if (hasFk && fkTargetTableId && fkTargetColumnId) {
      fkData = {
        targetTableId: fkTargetTableId,
        targetColumnId: fkTargetColumnId,
        onDelete: fkOnDelete
      };
    }

    onSave({
      id: column?.id || `col-${Date.now()}`,
      name: name.trim().toLowerCase().replace(/\s+/g, '_'),
      type,
      enumName: type === 'ENUM' ? enumName.trim() : undefined,
      isPrimaryKey,
      isNullable: isPrimaryKey ? false : isNullable,
      isUnique,
      isIndexed: isPrimaryKey ? false : isIndexed,
      isAutoIncrement,
      defaultValue: defaultValue.trim() || undefined,
      foreignKey: fkData
    });

    onClose();
  };

  const dataTypes: DataType[] = [
    'INT',
    'BIGINT',
    'VARCHAR',
    'TEXT',
    'BOOLEAN',
    'UUID',
    'DECIMAL',
    'FLOAT',
    'TIMESTAMP',
    'DATE',
    'JSON',
    'ENUM'
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
              <Tag size={18} />
            </div>
            <h3 className="font-semibold text-slate-100 text-base">
              {column ? 'Edit Column' : 'Add New Column'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto custom-scrollbar flex-1">
          <div>
            <label className="block text-slate-300 font-medium mb-1.5">Column Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 font-mono text-sm transition-all"
              placeholder="e.g. user_id, email, created_at"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1.5">Data Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as DataType)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono outline-none focus:border-indigo-500 transition-all"
              >
                {dataTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1.5">Default Value (Optional)</label>
              <input
                type="text"
                value={defaultValue}
                onChange={(e) => setDefaultValue(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono outline-none focus:border-indigo-500"
                placeholder="e.g. NOW(), true, 'pending'"
              />
            </div>
          </div>

          {type === 'ENUM' && (
            <div>
              <label className="block text-slate-300 font-medium mb-1.5">Enum Type Name</label>
              <input
                type="text"
                value={enumName}
                onChange={(e) => setEnumName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono outline-none focus:border-indigo-500"
                placeholder="e.g. RetrievalType, SourceStatus"
                required
              />
            </div>
          )}

          {/* Constraints Switches */}
          <div className="pt-2 grid grid-cols-2 gap-2 border-t border-slate-800/80">
            <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 cursor-pointer hover:border-amber-500/50 transition-colors">
              <input
                type="checkbox"
                checked={isPrimaryKey}
                onChange={(e) => {
                  setIsPrimaryKey(e.target.checked);
                  if (e.target.checked) setIsNullable(false);
                }}
                className="rounded accent-amber-500"
              />
              <Key size={14} className="text-amber-400" />
              <span className="font-semibold text-slate-200">Primary Key</span>
            </label>

            <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 cursor-pointer hover:border-indigo-500/50 transition-colors">
              <input
                type="checkbox"
                checked={isNullable}
                disabled={isPrimaryKey}
                onChange={(e) => setIsNullable(e.target.checked)}
                className="rounded accent-indigo-500"
              />
              <span className="font-semibold text-slate-200">Nullable (?)</span>
            </label>

            <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 cursor-pointer hover:border-purple-500/50 transition-colors">
              <input
                type="checkbox"
                checked={isUnique}
                onChange={(e) => setIsUnique(e.target.checked)}
                className="rounded accent-purple-500"
              />
              <span className="font-semibold text-slate-200">Unique constraint</span>
            </label>

            <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 cursor-pointer hover:border-emerald-500/50 transition-colors">
              <input
                type="checkbox"
                checked={isIndexed}
                onChange={(e) => setIsIndexed(e.target.checked)}
                className="rounded accent-emerald-500"
              />
              <Hash size={14} className="text-emerald-400" />
              <span className="font-semibold text-slate-200">Indexed (CREATE INDEX)</span>
            </label>
          </div>

          {/* Foreign Key Section */}
          <div className="pt-2 border-t border-slate-800/80">
            <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 cursor-pointer hover:border-indigo-500/50 transition-colors mb-3">
              <input
                type="checkbox"
                checked={hasFk}
                onChange={(e) => setHasFk(e.target.checked)}
                className="rounded accent-indigo-500"
              />
              <Lock size={14} className="text-indigo-400" />
              <span className="font-semibold text-slate-200">Foreign Key Relation</span>
            </label>

            {hasFk && (
              <div className="space-y-3 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 font-medium mb-1">Target Table</label>
                    <select
                      value={fkTargetTableId}
                      onChange={(e) => {
                        setFkTargetTableId(e.target.value);
                        setFkTargetColumnId('');
                      }}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 font-mono outline-none"
                    >
                      <option value="">Select table...</option>
                      {tables
                        .filter((t) => t.id !== currentTableId)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 font-medium mb-1">Target Column</label>
                    <select
                      value={fkTargetColumnId}
                      onChange={(e) => setFkTargetColumnId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 font-mono outline-none"
                    >
                      <option value="">Select column...</option>
                      {targetTable?.columns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.type})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-lg shadow-indigo-600/30 transition-all"
            >
              {column ? 'Save Changes' : 'Add Column'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
