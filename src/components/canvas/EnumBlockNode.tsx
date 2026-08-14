import React from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { Tag, Trash2, Edit3, Check } from 'lucide-react';
import type { EnumDefinition } from '../../types/schema';

export const EnumBlockNode: React.FC<NodeProps<any>> = ({ data, selected }) => {
  const enumDef: EnumDefinition = data.enumDef;
  const headerColor = '#ec4899'; // Pink/Magenta for Enums

  return (
    <div
      className={`enum-node-card rounded-2xl shadow-2xl bg-slate-900 border text-slate-100 transition-all duration-200 w-full h-full min-w-[220px] min-h-[70px] overflow-hidden flex flex-col ${
        selected ? 'border-pink-400 ring-2 ring-pink-500/50 scale-[1.01]' : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      <NodeResizer
        minWidth={220}
        minHeight={70}
        isVisible={selected}
        lineClassName="!border-pink-500"
        handleClassName="!w-2.5 !h-2.5 !bg-pink-500 !border-slate-900 !rounded-full"
      />

      <Handle
        type="target"
        position={Position.Left}
        id={`${enumDef.name}-target`}
        className="!w-3.5 !h-3.5 !bg-pink-500 !border-2 !border-slate-900 hover:!scale-125 transition-transform"
      />

      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between font-bold border-b border-slate-800 flex-shrink-0"
        style={{ background: `linear-gradient(135deg, ${headerColor}25 0%, rgba(15, 23, 42, 0.95) 100%)` }}
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="p-1 rounded-md bg-pink-500/20 text-pink-400">
            <Tag size={14} />
          </div>
          <div className="overflow-hidden">
            <h3 className="text-sm font-bold text-slate-100 tracking-wide font-mono truncate">
              {enumDef.name}
            </h3>
            <span className="text-[10px] text-pink-400 font-mono">ENUM TYPE</span>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {data.onEditEnum && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                data.onEditEnum(enumDef);
              }}
              title="Edit Enum"
              className="p-1 rounded text-slate-400 hover:text-pink-300 transition-colors"
            >
              <Edit3 size={13} />
            </button>
          )}
          {data.onDeleteEnum && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                data.onDeleteEnum(enumDef.id);
              }}
              title="Delete Enum"
              className="p-1 rounded text-slate-400 hover:text-rose-400 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Options / Values List */}
      <div className="p-3 space-y-1.5 overflow-y-auto flex-1 custom-scrollbar min-h-0">
        {enumDef.values.map((val, idx) => (
          <div
            key={idx}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800/80 text-xs font-mono text-pink-200"
          >
            <Check size={12} className="text-pink-400 flex-shrink-0" />
            <span className="truncate">{val}</span>
          </div>
        ))}

        {enumDef.values.length === 0 && (
          <p className="text-xs text-slate-500 italic text-center p-2">No enum options defined</p>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id={`${enumDef.name}-source`}
        className="!w-3.5 !h-3.5 !bg-pink-500 !border-2 !border-slate-900 hover:!scale-125 transition-transform"
      />
    </div>
  );
};
