import React, { useMemo, useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  BackgroundVariant
} from '@xyflow/react';
import type { Connection, Edge, Node, NodeTypes, EdgeTypes } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { TableNode } from './TableNode';
import { SchemaBlockNode } from './SchemaBlockNode';
import { EnumBlockNode } from './EnumBlockNode';
import { CustomEdge } from './CustomEdge';
import type { DatabaseProject, Table, Column, CanvasViewMode, EnumDefinition } from '../../types/schema';

interface SchemaCanvasProps {
  project: DatabaseProject;
  viewMode: CanvasViewMode;
  selectedSchemaId: string | null;
  onInspectSchema: (schemaId: string) => void;
  onUpdateTables: (tables: Table[]) => void;
  onEditTable: (table: Table) => void;
  onDeleteTable: (tableId: string) => void;
  onAddColumn: (tableId: string) => void;
  onEditColumn: (tableId: string, column: Column) => void;
  onDeleteColumn: (tableId: string, columnId: string) => void;
  onDeleteEnum?: (enumId: string) => void;
  onEditEnum?: (enumDef: EnumDefinition) => void;
}

const nodeTypes: NodeTypes = {
  tableNode: TableNode as any,
  schemaBlockNode: SchemaBlockNode as any,
  enumBlockNode: EnumBlockNode as any,
};

const edgeTypes: EdgeTypes = {
  customEdge: CustomEdge as any,
};

export const SchemaCanvas: React.FC<SchemaCanvasProps> = ({
  project,
  viewMode,
  selectedSchemaId,
  onInspectSchema,
  onUpdateTables,
  onEditTable,
  onDeleteTable,
  onAddColumn,
  onEditColumn,
  onDeleteColumn,
  onDeleteEnum,
  onEditEnum
}) => {
  const tableMap = useMemo(() => {
    const map = new Map<string, Table>();
    project.tables.forEach((t) => map.set(t.id, t));
    return map;
  }, [project.tables]);

  // Compute Nodes (Tables + Enums or Schema Blocks) based on View Mode
  const computedNodes: Node[] = useMemo(() => {
    if (viewMode === 'schemas_overview') {
      return project.schemas.map((schema, idx) => {
        const schemaTables = project.tables.filter((t) => t.schemaId === schema.id);
        const targetSchemaIds = new Set<string>();
        
        schemaTables.forEach((t) => {
          t.columns.forEach((c) => {
            if (c.foreignKey) {
              const targetTable = tableMap.get(c.foreignKey.targetTableId);
              if (targetTable && targetTable.schemaId && targetTable.schemaId !== schema.id) {
                targetSchemaIds.add(targetTable.schemaId);
              }
            }
          });
        });

        const targetSchemaNames = Array.from(targetSchemaIds).map(
          (sid) => project.schemas.find((s) => s.id === sid)?.name || sid
        );

        const pos = schema.position || {
          x: 80 + (idx % 3) * 400,
          y: 80 + Math.floor(idx / 3) * 350
        };

        return {
          id: schema.id,
          type: 'schemaBlockNode',
          position: pos,
          data: {
            schema,
            tables: schemaTables,
            targetSchemaNames,
            onInspectSchema
          }
        };
      });
    }

    // Detailed Table Cards View (all_tables or single_schema)
    const filteredTables =
      viewMode === 'single_schema' && selectedSchemaId
        ? project.tables.filter((t) => t.schemaId === selectedSchemaId)
        : project.tables;

    const tableNodes: Node[] = filteredTables.map((table) => ({
      id: table.id,
      type: 'tableNode',
      position: table.position || { x: 100, y: 100 },
      data: {
        table,
        onEditTable,
        onDeleteTable,
        onAddColumn,
        onEditColumn,
        onDeleteColumn
      }
    }));

    // Render Enum Block Nodes
    const filteredEnums =
      viewMode === 'single_schema' && selectedSchemaId
        ? (project.enums || []).filter((e) => !e.schemaId || e.schemaId === selectedSchemaId)
        : project.enums || [];

    const enumNodes: Node[] = filteredEnums.map((enumDef) => ({
      id: `enum-${enumDef.id}`,
      type: 'enumBlockNode',
      position: enumDef.position || { x: 1250, y: 100 },
      data: {
        enumDef,
        onDeleteEnum,
        onEditEnum
      }
    }));

    return [...tableNodes, ...enumNodes];
  }, [
    viewMode,
    project.schemas,
    project.tables,
    project.enums,
    selectedSchemaId,
    tableMap,
    onInspectSchema,
    onEditTable,
    onDeleteTable,
    onAddColumn,
    onEditColumn,
    onDeleteColumn,
    onDeleteEnum,
    onEditEnum
  ]);

  // Compute Edges (FK connections + Enum connections)
  const computedEdges: Edge[] = useMemo(() => {
    if (viewMode === 'schemas_overview') {
      const edgeList: Edge[] = [];
      const edgeSet = new Set<string>();

      project.tables.forEach((table) => {
        const sourceSchemaId = table.schemaId;
        if (!sourceSchemaId) return;

        table.columns.forEach((col) => {
          if (col.foreignKey) {
            const targetTable = tableMap.get(col.foreignKey.targetTableId);
            if (targetTable && targetTable.schemaId && targetTable.schemaId !== sourceSchemaId) {
              const edgeKey = `${sourceSchemaId}->${targetTable.schemaId}`;
              if (!edgeSet.has(edgeKey)) {
                edgeSet.add(edgeKey);
                const targetSchema = project.schemas.find((s) => s.id === targetTable.schemaId);
                edgeList.push({
                  id: `schema-edge-${edgeKey}`,
                  source: sourceSchemaId,
                  sourceHandle: `${sourceSchemaId}-source`,
                  target: targetTable.schemaId,
                  targetHandle: `${targetTable.schemaId}-target`,
                  type: 'customEdge',
                  label: `FK ➔ ${targetSchema ? targetSchema.name : 'schema'}`
                });
              }
            }
          }
        });
      });

      return edgeList;
    }

    const edges: Edge[] = [];
    const visibleNodeIds = new Set(computedNodes.map((n) => n.id));

    project.tables.forEach((table) => {
      if (!visibleNodeIds.has(table.id)) return;

      table.columns.forEach((col) => {
        // FK connections
        if (col.foreignKey && visibleNodeIds.has(col.foreignKey.targetTableId)) {
          edges.push({
            id: `edge-${table.id}-${col.id}-${col.foreignKey.targetTableId}`,
            source: table.id,
            sourceHandle: `${col.id}-source`,
            target: col.foreignKey.targetTableId,
            targetHandle: `${col.foreignKey.targetColumnId}-target`,
            type: 'customEdge',
            label: 'FK'
          });
        }

        // ENUM connections to Enum Block Nodes!
        if (col.type === 'ENUM' && col.enumName) {
          const matchingEnum = (project.enums || []).find(
            (e) => e.name.toLowerCase() === col.enumName?.toLowerCase()
          );
          if (matchingEnum) {
            const enumNodeId = `enum-${matchingEnum.id}`;
            if (visibleNodeIds.has(enumNodeId)) {
              edges.push({
                id: `edge-enum-${table.id}-${col.id}-${matchingEnum.id}`,
                source: table.id,
                sourceHandle: `${col.id}-source`,
                target: enumNodeId,
                targetHandle: `${matchingEnum.name}-target`,
                type: 'customEdge',
                label: 'ENUM'
              });
            }
          }
        }
      });
    });

    return edges;
  }, [viewMode, project.tables, project.schemas, project.enums, tableMap, computedNodes]);

  const [nodes, setNodes, onNodesChange] = useNodesState(computedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(computedEdges);

  useEffect(() => {
    setNodes(computedNodes);
  }, [computedNodes, setNodes]);

  useEffect(() => {
    setEdges(computedEdges);
  }, [computedEdges, setEdges]);

  const handleNodeDragStop = useCallback(
    (_: any, node: Node) => {
      if (viewMode === 'schemas_overview') return;

      if (node.type === 'tableNode') {
        const updatedTables = project.tables.map((tbl) => {
          if (tbl.id === node.id) {
            return { ...tbl, position: node.position };
          }
          return tbl;
        });
        onUpdateTables(updatedTables);
      }
    },
    [viewMode, project.tables, onUpdateTables]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (viewMode === 'schemas_overview') return;
      if (!params.source || !params.target || !params.sourceHandle || !params.targetHandle) return;

      const sourceColId = params.sourceHandle.replace('-source', '');
      const targetColId = params.targetHandle.replace('-target', '');

      const updatedTables = project.tables.map((tbl) => {
        if (tbl.id === params.source) {
          const updatedCols = tbl.columns.map((col) => {
            if (col.id === sourceColId) {
              return {
                ...col,
                foreignKey: {
                  targetTableId: params.target!,
                  targetColumnId: targetColId,
                  onDelete: 'CASCADE' as const
                }
              };
            }
            return col;
          });
          return { ...tbl, columns: updatedCols };
        }
        return tbl;
      });

      onUpdateTables(updatedTables);
      setEdges((eds) => addEdge({ ...params, type: 'customEdge', label: 'FK' }, eds));
    },
    [viewMode, project.tables, onUpdateTables, setEdges]
  );

  return (
    <div className="w-full h-full relative bg-slate-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={handleNodeDragStop}
        onConnect={onConnect}
        fitView
        colorMode="dark"
        defaultEdgeOptions={{ type: 'customEdge' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="#334155" />
        <Controls className="!bg-slate-900 !border-slate-800 !text-slate-200 !shadow-xl !rounded-xl overflow-hidden" />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === 'enumBlockNode') return '#ec4899';
            if (viewMode === 'schemas_overview') return (node.data?.schema as any)?.color || '#8b5cf6';
            return (node.data?.table as Table)?.color || '#6366f1';
          }}
          nodeStrokeColor="#818cf8"
          nodeBorderRadius={8}
          nodeStrokeWidth={2}
          maskColor="rgba(15, 23, 42, 0.85)"
          className="!bg-slate-900 !border-2 !border-slate-800 !rounded-2xl overflow-hidden shadow-2xl !w-60 !h-40"
          zoomable
          pannable
        />
      </ReactFlow>
    </div>
  );
};
