import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  title: string;
  message: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  title,
  message,
  isOpen,
  onClose,
  onConfirm
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-rose-400">
            <AlertTriangle size={18} />
            <h3 className="font-semibold text-slate-100 text-sm">{title}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          <p className="text-slate-300 leading-relaxed">{message}</p>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium shadow-lg shadow-rose-600/30 transition-all"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
