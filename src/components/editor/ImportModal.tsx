import React, { useState } from 'react';
import { X, FileCode2, Sparkles } from 'lucide-react';
import { parseSqlToTables } from '../../utils/sqlImporter';
import type { Table } from '../../types/schema';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportTables: (importedTables: Table[]) => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose, onImportTables }) => {
  const [sqlText, setSqlText] = useState(`CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE posts (
  id INT PRIMARY KEY AUTOINCREMENT,
  title VARCHAR NOT NULL,
  content TEXT,
  author_id UUID
);`);

  if (!isOpen) return null;

  const handleImport = () => {
    if (!sqlText.trim()) return;
    const parsedTables = parseSqlToTables(sqlText);
    if (parsedTables.length > 0) {
      onImportTables(parsedTables);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCode2 className="text-indigo-400" size={20} />
            <h3 className="font-semibold text-slate-100 text-base">Import SQL DDL Statements</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          <p className="text-slate-400">
            Paste your SQL DDL statements (e.g., <code className="text-indigo-300 font-mono">CREATE TABLE ...</code>).
            The parser will extract tables, column types, primary keys, and nullability, and render them on your visual canvas!
          </p>

          <textarea
            value={sqlText}
            onChange={(e) => setSqlText(e.target.value)}
            rows={10}
            className="w-full p-3 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono text-xs outline-none focus:border-indigo-500 custom-scrollbar leading-relaxed"
            placeholder="Paste your CREATE TABLE SQL queries here..."
          />

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-lg shadow-indigo-600/30 transition-all"
            >
              <Sparkles size={14} />
              Import to Canvas
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
