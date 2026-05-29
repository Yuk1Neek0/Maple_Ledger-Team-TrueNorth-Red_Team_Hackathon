import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";

// Renders the provenance DAG with Cytoscape.js.
//
// Node colouring rules (per spec):
//   - status === "INVALID"  -> red (a failed integrity check)
//   - otherwise by country  -> CA green-ish, everything else grey
//
// Graph shape (supplied separately from /verify until integration):
//   { nodes: [{ id, label, country, status }],
//     edges: [{ source, target }] }    // edge = input -> consumer

const CA_GREEN = "#16a34a"; // emerald-600
const OTHER_GREY = "#94a3b8"; // slate-400
const INVALID_RED = "#dc2626"; // red-600

function nodeColor(node) {
  if (node.status === "INVALID") return INVALID_RED;
  return node.country === "CA" ? CA_GREEN : OTHER_GREY;
}

export default function ProvenanceGraph({ graph }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !graph) return;

    const elements = [
      ...graph.nodes.map((n) => ({
        data: {
          id: n.id,
          label: n.label || n.id,
          color: nodeColor(n),
          status: n.status || "OK",
          country: n.country || "",
        },
      })),
      ...graph.edges.map((e) => ({
        data: {
          id: `${e.source}->${e.target}`,
          source: e.source,
          target: e.target,
        },
      })),
    ];

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            "background-color": "data(color)",
            label: "data(label)",
            color: "#0f172a",
            "font-size": 11,
            "font-family":
              "ui-sans-serif, system-ui, 'Segoe UI', Roboto, sans-serif",
            "text-wrap": "wrap",
            "text-valign": "bottom",
            "text-margin-y": 6,
            "text-halign": "center",
            width: 34,
            height: 34,
            "border-width": 2,
            "border-color": "#ffffff",
          },
        },
        {
          selector: 'node[status = "INVALID"]',
          style: {
            "border-color": INVALID_RED,
            "border-width": 3,
          },
        },
        {
          selector: "edge",
          style: {
            width: 2,
            "line-color": "#cbd5e1", // slate-300
            "target-arrow-color": "#cbd5e1",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            "arrow-scale": 1.1,
          },
        },
      ],
      layout: {
        name: "breadthfirst",
        directed: true,
        spacingFactor: 1.3,
        padding: 24,
      },
      // Read-only-ish: allow pan/zoom but no accidental node dragging chaos.
      autoungrabify: false,
      wheelSensitivity: 0.2,
    });

    cyRef.current = cy;
    // Fit after layout settles.
    cy.ready(() => cy.fit(undefined, 30));

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [graph]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-800">Provenance graph</h2>
      <p className="mt-1 text-sm text-slate-500">
        Each node is a supplier contribution; arrows point from input to
        consumer.
      </p>

      <div
        ref={containerRef}
        className="mt-4 h-80 w-full rounded-xl bg-slate-50"
      />

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600">
        <LegendDot color={CA_GREEN} label="Canadian (OK)" />
        <LegendDot color={OTHER_GREY} label="Foreign (OK)" />
        <LegendDot color={INVALID_RED} label="Integrity failure" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-3 w-3 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
