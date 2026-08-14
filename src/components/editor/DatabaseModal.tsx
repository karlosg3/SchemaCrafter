import React, { useState } from 'react';
import { X, Database } from 'lucide-react';
import type { DatabaseProject, DatabaseEngine } from '../../types/schema';

interface DatabaseModalProps {
  project?: DatabaseProject;
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, engine: DatabaseEngine) => void;
}

export const DatabaseModal: React.FC<DatabaseModalProps> = ({ project, isOpen, onClose, onSave }) => {
  const [name, setName] = useState(project?.name || '');
  const [engine, setEngine] = useState<DatabaseEngine>(project?.engine || 'postgresql');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim(), engine);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
              <Database size={18} />
            </div>
            <h3 className="font-semibold text-slate-100 text-base">
              {project ? 'Edit Database Project' : 'Create New Database'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1.5">Database Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 font-mono text-sm transition-all"
              placeholder="e.g. production_db, auth_service"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1.5">Database Engine</label>
            <div className="grid grid-cols-3 gap-2">
              {(['postgresql', 'mysql', 'sqlite'] as DatabaseEngine[]).map((eng) => (
                <button
                  type="button"
                  key={eng}
                  onClick={() => setEngine(eng)}
                  className={`py-2 px-3 rounded-xl border text-xs font-mono font-medium transition-all ${
                    engine === eng
                      ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200 shadow-md'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  {eng.toUpperCase()}
                </button>
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
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-lg shadow-indigo-600/30 transition-all"
            >
              {project ? 'Save Changes' : 'Create Database'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
