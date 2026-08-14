import React from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { Key, Plus, Trash2, Edit3, Lock, Hash } from 'lucide-react';
import type { Table, Column } from '../../types/schema';

export const TableNode: React.FC<NodeProps<any>> = ({ data, selected }) => {
  const table: Table = data.table;
  const headerColor = table.color || '#6366f1';
  const tableIndexes = table.indexes || [];

  return (
    <div
      className={`table-node-card rounded-2xl shadow-2xl bg-slate-900 border text-slate-100 transition-shadow duration-200 w-full h-full min-w-[240px] min-h-[75px] overflow-hidden flex flex-col relative group/card ${
        selected ? 'border-indigo-400 ring-2 ring-indigo-500/50 scale-[1.01]' : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      {/* Node Resizer handles */}
      <NodeResizer
        minWidth={240}
        minHeight={75}
        isVisible={selected}
        lineClassName="!border-indigo-500 !border-2"
        handleClassName="!w-3.5 !h-3.5 !bg-indigo-500 !border-2 !border-slate-900 !rounded-full"
      />

      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between font-bold border-b border-slate-800 flex-shrink-0"
        style={{ background: `linear-gradient(135deg, ${headerColor}25 0%, rgba(15, 23, 42, 0.95) 100%)` }}
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div
            className="w-3.5 h-3.5 rounded-full flex-shrink-0 shadow-sm"
            style={{ backgroundColor: headerColor }}
          />
          <h3 className="text-sm font-bold text-slate-100 tracking-wide font-mono truncate">
            {table.name}
          </h3>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              data.onAddColumn(table.id);
            }}
            title="Add Column"
            className="p-1 rounded text-slate-400 hover:text-indigo-300 transition-colors"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              data.onEditTable(table);
            }}
            title="Edit Table Properties"
            className="p-1 rounded text-slate-400 hover:text-indigo-300 transition-colors"
          >
            <Edit3 size={13} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              data.onDeleteTable(table.id);
            }}
            title="Delete Table"
            className="p-1 rounded text-slate-400 hover:text-rose-400 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Column Rows */}
      <div className="p-2 space-y-1 overflow-y-auto flex-1 custom-scrollbar min-h-0">
        {table.columns.map((col: Column) => (
          <div
            key={col.id}
            className="group relative flex items-center justify-between px-3 py-1.5 rounded-xl hover:bg-slate-800/80 transition-colors text-xs font-mono border border-transparent hover:border-slate-700/60"
          >
            {/* Left Handle (FK Target) */}
            <Handle
              type="target"
              position={Position.Left}
              id={`${col.id}-target`}
              className="!w-2.5 !h-2.5 !bg-indigo-500 !border-2 !border-slate-900 hover:!scale-125 transition-transform"
            />

            <div className="flex items-center gap-2 overflow-hidden flex-1 mr-2">
              {col.isPrimaryKey && (
                <span title="Primary Key" className="flex items-center">
                  <Key size={13} className="text-amber-400 flex-shrink-0" />
                </span>
              )}
              {col.foreignKey && !col.isPrimaryKey && (
                <span title="Foreign Key" className="flex items-center">
                  <Lock size={13} className="text-indigo-400 flex-shrink-0" />
                </span>
              )}
              {col.isIndexed && (
                <span title="Indexed Column" className="flex items-center">
                  <Hash size={13} className="text-emerald-400 flex-shrink-0" />
                </span>
              )}

              <span className={`truncate ${col.isPrimaryKey ? 'font-bold text-slate-100' : 'text-slate-300'}`}>
                {col.name}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-950/80 text-indigo-300 font-mono border border-slate-800">
                {col.type === 'ENUM' && col.enumName ? col.enumName : col.type}
              </span>

              {col.isNullable && (
                <span className="text-[9px] text-slate-400 font-mono" title="Nullable">
                  ?
                </span>
              )}

              {/* Reserved 44px container for edit/delete buttons */}
              <div className="w-[44px] flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    data.onEditColumn(table.id, col);
                  }}
                  title="Edit Column"
                  className="p-1 text-slate-400 hover:text-indigo-300 transition-colors"
                >
                  <Edit3 size={12} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    data.onDeleteColumn(table.id, col.id);
                  }}
                  title="Delete Column"
                  className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>

            {/* Right Handle (FK Source) */}
            <Handle
              type="source"
              position={Position.Right}
              id={`${col.id}-source`}
              className="!w-2.5 !h-2.5 !bg-indigo-500 !border-2 !border-slate-900 hover:!scale-125 transition-transform"
            />
          </div>
        ))}

        {table.columns.length === 0 && (
          <p className="text-xs text-slate-500 italic text-center py-2">No columns defined</p>
        )}
      </div>

      {/* Index Summary Badges Footer */}
      {(tableIndexes.length > 0 || table.columns.some((c) => c.isIndexed)) && (
        <div className="px-3 py-1.5 bg-slate-950/90 border-t border-slate-800/80 flex items-center gap-1.5 flex-wrap flex-shrink-0">
          <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1 font-semibold">
            <Hash size={11} /> INDEXES:
          </span>
          {table.columns.filter((c) => c.isIndexed).map((c) => (
            <span
              key={c.id}
              className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono"
            >
              idx_{c.name}
            </span>
          ))}
          {tableIndexes.map((idx) => (
            <span
              key={idx.id}
              className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono"
            >
              {idx.name} ({idx.columnNames.join(', ')})
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
