import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
import type { Table, SchemaGroup } from '../../types/schema';

interface TableModalProps {
  table: Table;
  schemas: SchemaGroup[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedTable: Table) => void;
}

export const TableModal: React.FC<TableModalProps> = ({ table, schemas, isOpen, onClose, onSave }) => {
  const [name, setName] = useState(table.name);
  const [color, setColor] = useState(table.color || '#6366f1');
  const [schemaId, setSchemaId] = useState(table.schemaId || '');
  const [comment, setComment] = useState(table.comment || '');

  if (!isOpen) return null;

  const colorPresets = [
    '#6366f1',
    '#10b981',
    '#f59e0b',
    '#ec4899',
    '#8b5cf6',
    '#3b82f6',
    '#ef4444',
    '#14b8a6',
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      ...table,
      name: name.trim().toLowerCase().replace(/\s+/g, '_'),
      color,
      schemaId: schemaId || undefined,
      comment: comment.trim() || undefined
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-semibold text-slate-100 text-base">Edit Table Properties</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1.5">Table Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 outline-none focus:border-indigo-500 font-mono text-sm"
              placeholder="e.g. users"
              required
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1.5">Schema Group</label>
            <select
              value={schemaId}
              onChange={(e) => setSchemaId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 outline-none focus:border-indigo-500 font-mono"
            >
              <option value="">Default (public)</option>
              {schemas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1.5">Card Accent Color</label>
            <div className="flex items-center gap-2">
              {colorPresets.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform ${
                    color === c ? 'scale-110 ring-2 ring-white shadow-lg' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                >
                  {color === c && <Check size={14} className="text-white drop-shadow" />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1.5">Comment / Description</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 outline-none focus:border-indigo-500"
              placeholder="Optional table description..."
            />
          </div>

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-lg shadow-indigo-600/30 transition-all"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
