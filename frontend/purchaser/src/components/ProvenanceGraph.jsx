import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import Panel from "./ui/Panel.jsx";

// Renders the provenance DAG with Cytoscape.js, styled for the control-room
// theme. Node colouring:
//   - status === "INVALID"  -> alarm red (a failed integrity check)
//   - otherwise by country  -> CA signal-green, everything else dim grey
// Graph shape: { nodes:[{id,label,country,status}], edges:[{source,target}] }
// edge = input -> consumer.

const CA_GREEN = "#34e8a0";
const OTHER_GREY = "#7e8e9a";
const INVALID_RED = "#ff5247";

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
          // Cytoscape label gets a small "#seq" suffix when the node is anchored
          // in the transparency log (P4) — the visible proof that every node in
          // the chain made it into the ledger.
          id: n.id,
          label: n.log_seq != null ? `${n.label || n.id}\n#${n.log_seq}` : (n.label || n.id),
          color: nodeColor(n),
          status: n.status || "OK",
          country: n.country || "",
          log_seq: n.log_seq ?? null,
        },
      })),
      ...graph.edges.map((e) => ({
        data: { id: `${e.source}->${e.target}`, source: e.source, target: e.target },
      })),
    ];

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            "background-color": "#0c1014",
            "border-color": "data(color)",
            "border-width": 2,
            label: "data(label)",
            color: "#d3dde4",
            "font-size": 10,
            "font-family": "'JetBrains Mono Variable', ui-monospace, monospace",
            "text-wrap": "wrap",
            "text-valign": "bottom",
            "text-margin-y": 7,
            "text-halign": "center",
            width: 30,
            height: 30,
            shape: "round-rectangle",
          },
        },
        {
          selector: "node:selected",
          style: { "border-color": "#46d6f0", "border-width": 3 },
        },
        {
          selector: 'node[status = "INVALID"]',
          style: { "border-color": INVALID_RED, "border-width": 3 },
        },
        {
          selector: "edge",
          style: {
            width: 1.5,
            "line-color": "#2c3a45",
            "target-arrow-color": "#46d6f0",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            "arrow-scale": 1,
          },
        },
      ],
      layout: { name: "breadthfirst", directed: true, spacingFactor: 1.3, padding: 24 },
      autoungrabify: false,
      wheelSensitivity: 0.2,
    });

    cyRef.current = cy;
    cy.ready(() => cy.fit(undefined, 30));

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [graph]);

  return (
    <Panel label="chain of custody" accent="cyan" right={`${graph?.nodes?.length || 0} nodes`}>
      <p className="prose-sans text-sm text-dim">
        Each node is a supplier contribution; arrows point from input to consumer.
      </p>

      <div ref={containerRef} className="mt-4 h-80 w-full border border-line bg-base" />

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-dim">
        <LegendDot color={CA_GREEN} label="Canadian · OK" />
        <LegendDot color={OTHER_GREY} label="Foreign · OK" />
        <LegendDot color={INVALID_RED} label="Integrity failure" />
      </div>
    </Panel>
  );
}

function LegendDot({ color, label }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
