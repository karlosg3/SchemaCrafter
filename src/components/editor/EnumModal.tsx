import React, { useState } from 'react';
import { X, Tag, Plus, Trash2 } from 'lucide-react';
import type { EnumDefinition } from '../../types/schema';

interface EnumModalProps {
  enumDef?: EnumDefinition;
  isOpen: boolean;
  onClose: () => void;
  onSave: (enumDef: EnumDefinition) => void;
}

export const EnumModal: React.FC<EnumModalProps> = ({ enumDef, isOpen, onClose, onSave }) => {
  const [name, setName] = useState(enumDef?.name || '');
  const [values, setValues] = useState<string[]>(enumDef?.values || ['']);

  if (!isOpen) return null;

  const handleAddValue = () => {
    setValues([...values, '']);
  };

  const handleRemoveValue = (index: number) => {
    setValues(values.filter((_, i) => i !== index));
  };

  const handleValueChange = (index: number, val: string) => {
    const next = [...values];
    next[index] = val;
    setValues(next);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const cleanValues = values.map((v) => v.trim()).filter(Boolean);
    onSave({
      id: enumDef?.id || `enum-${Date.now()}`,
      name: name.trim().replace(/\s+/g, '_'),
      values: cleanValues,
      position: enumDef?.position || { x: 1250, y: 100 }
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-pink-500/20 text-pink-400">
              <Tag size={18} />
            </div>
            <h3 className="font-semibold text-slate-100 text-base">
              {enumDef ? 'Edit Enum Type' : 'Create New Enum'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1.5">Enum Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500/40 font-mono text-sm transition-all"
              placeholder="e.g. SourceStatus, RetrievalType"
              required
              autoFocus
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-slate-300 font-medium">Enum Options / Values</label>
              <button
                type="button"
                onClick={handleAddValue}
                className="flex items-center gap-1 text-pink-400 hover:text-pink-300 font-medium"
              >
                <Plus size={13} />
                Add Value
              </button>
            </div>

            <div className="space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar p-1">
              {values.map((val, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={val}
                    onChange={(e) => handleValueChange(idx, e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono outline-none focus:border-pink-500"
                    placeholder={`e.g. option_${idx + 1}`}
                    required
                  />
                  {values.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveValue(idx)}
                      className="p-2 text-slate-500 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
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
              className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-medium shadow-lg shadow-pink-600/30 transition-all"
            >
              {enumDef ? 'Save Changes' : 'Create Enum'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
