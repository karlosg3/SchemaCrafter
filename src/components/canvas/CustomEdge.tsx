import React from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';

export const CustomEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  label
}) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: '#818cf8',
          strokeWidth: 2.5,
          strokeDasharray: '6 3',
          animation: 'dashdraw 30s linear infinite',
          ...style,
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan px-2 py-0.5 rounded-full bg-slate-900 border border-indigo-500/50 text-[10px] font-mono text-indigo-300 shadow-lg"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};
