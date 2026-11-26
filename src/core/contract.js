export const SCHEMA_VERSION = 1;

// Versioned response from the Rust engine.
export function assertResult(result) {
  if (result?.schemaVersion !== SCHEMA_VERSION || !Array.isArray(result.nodes) || !Array.isArray(result.edges)) {
    throw new Error('Unsupported analysis result');
  }
  const ids = new Set(result.nodes.map(node => node.id));
  if (ids.size !== result.nodes.length || result.edges.some(edge =>
    typeof edge.source !== 'string' || typeof edge.target !== 'string' ||
    !ids.has(edge.source) || !ids.has(edge.target))) {
    throw new Error('Invalid graph endpoints');
  }
  if (result.packages) {
    const { nodes, edges, diagnostics } = result.packages;
    if (!Array.isArray(nodes) || !Array.isArray(edges) || !Array.isArray(diagnostics)) throw new Error('Invalid package graph');
    const packages = new Set(nodes.map(node => node.id));
    if (packages.size !== nodes.length || nodes.some(node => ids.has(node.id)) || edges.some(edge =>
      !packages.has(edge.target) || (!packages.has(edge.source) && !ids.has(edge.source)))) throw new Error('Invalid package endpoints');
  }
}
