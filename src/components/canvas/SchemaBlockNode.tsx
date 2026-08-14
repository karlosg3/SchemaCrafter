import React from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { Layers, Table as TableIcon, ArrowRight, Eye } from 'lucide-react';
import type { SchemaGroup, Table } from '../../types/schema';

export const SchemaBlockNode: React.FC<NodeProps<any>> = ({ data, selected }) => {
  const schema: SchemaGroup = data.schema;
  const tables: Table[] = data.tables || [];
  const targetSchemaNames: string[] = data.targetSchemaNames || [];
  const color = schema.color || '#8b5cf6';

  return (
    <div
      className={`schema-block-card rounded-2xl shadow-2xl bg-slate-900 border text-slate-100 transition-all duration-200 w-full h-full min-w-[250px] min-h-[80px] overflow-hidden flex flex-col ${
        selected ? 'border-amber-400 ring-2 ring-amber-500/50 scale-[1.01]' : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      <NodeResizer
        minWidth={250}
        minHeight={80}
        isVisible={selected}
        lineClassName="!border-amber-500"
        handleClassName="!w-2.5 !h-2.5 !bg-amber-500 !border-slate-900 !rounded-full"
      />

      <Handle
        type="target"
        position={Position.Left}
        id={`${schema.id}-target`}
        className="!w-3.5 !h-3.5 !bg-amber-500 !border-2 !border-slate-900 hover:!scale-125 transition-transform"
      />

      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between font-bold border-b border-slate-800 flex-shrink-0"
        style={{ background: `linear-gradient(135deg, ${color}30 0%, rgba(15, 23, 42, 0.95) 100%)` }}
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="p-1.5 rounded-lg text-white" style={{ backgroundColor: color }}>
            <Layers size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 tracking-wide font-mono truncate">
              {schema.name}
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">
              {tables.length} {tables.length === 1 ? 'table' : 'tables'}
            </span>
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            data.onInspectSchema(schema.id);
          }}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-all flex-shrink-0"
          title="Inspect Schema Tables"
        >
          <Eye size={13} />
          Inspect
        </button>
      </div>

      {/* Contained Tables List */}
      <div className="p-3 space-y-1.5 overflow-y-auto flex-1 custom-scrollbar min-h-0">
        {tables.map((tbl) => (
          <div
            key={tbl.id}
            className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800/80 text-xs font-mono text-slate-300"
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <TableIcon size={13} className="text-indigo-400 flex-shrink-0" />
              <span className="truncate">{tbl.name}</span>
            </div>
            <span className="text-[10px] text-slate-500">{tbl.columns.length} cols</span>
          </div>
        ))}

        {tables.length === 0 && (
          <p className="text-xs text-slate-500 italic text-center p-2">No tables in this schema</p>
        )}
      </div>

      {/* External FK References Footer Badges */}
      {targetSchemaNames.length > 0 && (
        <div className="px-3 py-2 bg-slate-950/90 border-t border-slate-800/80 flex items-center gap-1.5 flex-wrap flex-shrink-0">
          <span className="text-[10px] text-slate-400 font-medium">FK Links:</span>
          {targetSchemaNames.map((tName, i) => (
            <span
              key={i}
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono"
            >
              <ArrowRight size={10} />
              {tName}
            </span>
          ))}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        id={`${schema.id}-source`}
        className="!w-3.5 !h-3.5 !bg-amber-500 !border-2 !border-slate-900 hover:!scale-125 transition-transform"
      />
    </div>
  );
};
