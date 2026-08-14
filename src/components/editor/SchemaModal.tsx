import React, { useState } from 'react';
import { X, Layers, Check } from 'lucide-react';
import type { SchemaGroup } from '../../types/schema';

interface SchemaModalProps {
  schema?: SchemaGroup;
  isOpen: boolean;
  onClose: () => void;
  onSave: (schema: SchemaGroup) => void;
}

export const SchemaModal: React.FC<SchemaModalProps> = ({ schema, isOpen, onClose, onSave }) => {
  const [name, setName] = useState(schema?.name || '');
  const [color, setColor] = useState(schema?.color || '#6366f1');
  const [comment, setComment] = useState(schema?.comment || '');

  if (!isOpen) return null;

  const colorPresets = [
    '#6366f1', // Indigo
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#ec4899', // Pink
    '#8b5cf6', // Violet
    '#3b82f6', // Blue
    '#ef4444', // Red
    '#14b8a6', // Teal
    '#06b6d4', // Cyan
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSave({
      id: schema?.id || `schema-${Date.now()}`,
      name: name.trim().toLowerCase().replace(/\s+/g, '_'),
      color,
      comment: comment.trim() || undefined
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-400">
              <Layers size={18} />
            </div>
            <h3 className="font-semibold text-slate-100 text-base">
              {schema ? 'Edit Schema Group' : 'Create New Schema'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1.5">Schema Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/40 font-mono text-sm transition-all"
              placeholder="e.g. auth, billing, analytics"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1.5">Schema Badge Color</label>
            <div className="flex items-center gap-2.5 flex-wrap">
              {colorPresets.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                    color === c ? 'scale-110 ring-2 ring-white shadow-lg shadow-purple-500/30' : 'hover:scale-105 opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c }}
                >
                  {color === c && <Check size={14} className="text-white drop-shadow" />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1.5">Description / Purpose</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/40 transition-all"
              placeholder="Optional description of this schema..."
            />
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
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium shadow-lg shadow-purple-600/30 transition-all"
            >
              {schema ? 'Save Changes' : 'Create Schema'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
