// ProvenanceGraph: the supply chain as a directed graph, drawn with React Flow.
// Edges point from input -> consumer, so the layout flows left (raw materials)
// to right (finished product). Nodes are custom cards colored by status
// (invalid = red) and country (CA = navy, foreign = grey); the product node
// gets a heavier navy ring + badge.
//
// React Flow has no built-in graph layout, so we compute a layered (Sugiyama-
// style) placement locally: rank = longest path from a source, with a one-pass
// barycenter ordering within each column to keep edge crossings down.

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Panel from "./ui/Panel.jsx";

// palette pulled from the light design tokens (React Flow needs concrete colors)
const COLORS = {
  navy: "#26374a",
  red: "#d52b1e",
  grey: "#9aa0a6",
  paper: "#ffffff",
  paper2: "#f4f5f6",
  line: "#e1e4e7",
  line2: "#cdd2d7",
  ink: "#1f2933",
  ink3: "#9aa0a6",
};

const NODE_W = 200;
const NODE_H = 72;
const COL_GAP = 250; // horizontal distance between layers
const ROW_GAP = 100; // vertical distance between siblings in a layer

// ---- layered DAG layout ---------------------------------------------------
// Returns a Map<id, {x, y}>. Edge source = input (parent), target = consumer,
// so longest-path ranks place sources on the left and the product on the right.
function layout(nodes, edges) {
  const ids = nodes.map((n) => n.id);
  const outgoing = new Map(ids.map((id) => [id, []]));
  const indeg = new Map(ids.map((id) => [id, 0]));
  for (const e of edges) {
    if (!outgoing.has(e.source) || !indeg.has(e.target)) continue;
    outgoing.get(e.source).push(e.target);
    indeg.set(e.target, indeg.get(e.target) + 1);
  }

  // Kahn topo sort -> longest-path rank. Any nodes left over (a cycle) keep
  // rank 0 so the graph still renders instead of throwing.
  const rank = new Map(ids.map((id) => [id, 0]));
  const queue = ids.filter((id) => indeg.get(id) === 0);
  const left = new Map(indeg);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const c of outgoing.get(id)) {
      rank.set(c, Math.max(rank.get(c), rank.get(id) + 1));
      left.set(c, left.get(c) - 1);
      if (left.get(c) === 0) queue.push(c);
    }
  }

  // Group by column, then order rows by the mean row of each node's parents
  // (barycenter heuristic, single left-to-right pass).
  const parentsOf = new Map(ids.map((id) => [id, []]));
  for (const e of edges) {
    if (parentsOf.has(e.target)) parentsOf.get(e.target).push(e.source);
  }
  const columns = new Map();
  for (const id of ids) {
    const r = rank.get(id);
    if (!columns.has(r)) columns.set(r, []);
    columns.get(r).push(id);
  }

  const pos = new Map();
  const rowOf = new Map();
  const maxRows = Math.max(...[...columns.values()].map((c) => c.length), 1);
  const sortedCols = [...columns.keys()].sort((a, b) => a - b);
  for (const r of sortedCols) {
    const col = columns.get(r);
    col.sort((a, b) => {
      const ba = bary(parentsOf.get(a), rowOf);
      const bb = bary(parentsOf.get(b), rowOf);
      return ba - bb;
    });
    const offset = (maxRows - col.length) / 2; // center shorter columns
    col.forEach((id, i) => {
      rowOf.set(id, i);
      pos.set(id, {
        x: r * COL_GAP,
        y: (i + offset) * ROW_GAP,
      });
    });
  }
  return pos;
}

function bary(parents, rowOf) {
  const rows = parents.map((p) => rowOf.get(p)).filter((v) => v != null);
  if (!rows.length) return 0;
  return rows.reduce((s, v) => s + v, 0) / rows.length;
}

// ---- custom node ----------------------------------------------------------
const handleStyle = {
  width: 7,
  height: 7,
  background: COLORS.line2,
  border: "none",
};

function ProvenanceNode({ data }) {
  const invalid = data.status === "INVALID";
  const isCA = data.country === "CA";
  const stripe = invalid ? COLORS.red : isCA ? COLORS.navy : COLORS.grey;
  const border = invalid
    ? COLORS.red
    : data.is_product
    ? COLORS.navy
    : COLORS.line2;

  return (
    <div
      className="relative flex overflow-hidden rounded-btn bg-paper"
      style={{
        width: NODE_W,
        height: NODE_H,
        border: `${data.is_product || invalid ? 2 : 1}px solid ${border}`,
        boxShadow: invalid
          ? "0 0 0 3px var(--color-tint-red)"
          : data.is_product
          ? "0 0 0 3px var(--color-tint-navy)"
          : "0 1px 2px rgba(31,41,51,0.06)",
      }}
    >
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <span style={{ width: 4, background: stripe }} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col justify-center px-2.5 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-mono text-[9px] uppercase tracking-wider text-ink-3">
            {data.action_label || data.action_type}
          </span>
          {data.is_product && (
            <span className="ml-auto shrink-0 rounded bg-tint-navy px-1 py-px font-mono text-[8px] font-semibold uppercase tracking-wider text-navy">
              product
            </span>
          )}
        </div>
        <div className="truncate text-[12px] font-semibold leading-tight text-ink">
          {data.name}
        </div>
        <div className="flex items-center gap-1.5 truncate font-mono text-[10px] text-ink-2">
          <span
            className="shrink-0 rounded px-1 py-px text-[8px] font-semibold"
            style={{
              background: isCA ? "var(--color-tint-navy)" : "var(--color-paper-2)",
              color: isCA ? COLORS.navy : COLORS.ink,
            }}
          >
            {data.country || "??"}
          </span>
          <span className="truncate">{data.supplier}</span>
          {invalid && (
            <span className="ml-auto shrink-0 font-semibold text-red">✕ flagged</span>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  );
}

const nodeTypes = { provenance: ProvenanceNode };

export default function ProvenanceGraph({ graph }) {
  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };
    const pos = layout(graph.nodes, graph.edges);
    const nodes = graph.nodes.map((n) => ({
      id: n.id,
      type: "provenance",
      position: pos.get(n.id) || { x: 0, y: 0 },
      data: n,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: true,
    }));
    const edges = graph.edges.map((e, i) => {
      const target = graph.nodes.find((n) => n.id === e.target);
      const flagged = target?.status === "INVALID";
      return {
        id: `e${i}-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        type: "smoothstep",
        animated: true,
        style: { stroke: flagged ? COLORS.red : COLORS.line2, strokeWidth: 1.5 },
        markerEnd: {
          type: "arrowclosed",
          color: flagged ? COLORS.red : COLORS.line2,
          width: 16,
          height: 16,
        },
      };
    });
    return { nodes, edges };
  }, [graph]);

  return (
    <Panel label="provenance chain" accent="navy" right={`${graph?.nodes?.length || 0} nodes`}>
      <div className="h-[400px] w-full overflow-hidden rounded-btn border border-line-2 bg-paper-2">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={2}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ type: "smoothstep" }}
        >
          <Background color={COLORS.line2} gap={18} size={1} />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            nodeStrokeWidth={2}
            nodeColor={(n) =>
              n.data?.status === "INVALID"
                ? COLORS.red
                : n.data?.country === "CA"
                ? COLORS.navy
                : COLORS.grey
            }
            maskColor="rgba(244,245,246,0.6)"
            style={{ background: COLORS.paper }}
          />
        </ReactFlow>
      </div>
      <Legend />
      <p className="mt-2 text-[11px] text-ink-3">
        Topology drawn locally from the submitted chain&apos;s parent links; node flags mirror the
        verifier&apos;s anomalies. Not returned by the verifier.
      </p>
    </Panel>
  );
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-4 font-mono text-[11px] uppercase tracking-wider text-ink-3">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS.navy }} />
        canadian
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS.grey }} />
        imported
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS.red }} />
        flagged
      </span>
    </div>
  );
}
