export function indexPackages(packages = { nodes: [], edges: [] }) {
  const nodes = new Map(packages.nodes.map(node => [node.id, node]));
  const incoming = new Map(), outgoing = new Map();
  for (const edge of packages.edges) {
    if (!incoming.has(edge.target)) incoming.set(edge.target, []);
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    incoming.get(edge.target).push(edge);
    outgoing.get(edge.source).push(edge);
  }
  return { nodes, incoming, outgoing };
}

// Traverse only observed package relations, never the structural file graph.
export function packageConsumers(index, id, transitive = false) {
  const seen = new Set([id]), pending = [id], consumers = new Map();
  if (transitive) for (const edge of index.outgoing.get(id) || []) {
    if (edge.kind==='resolves-to' && !seen.has(edge.target)) { seen.add(edge.target); pending.push(edge.target); }
  }
  for (let cursor = 0; cursor < pending.length; cursor++) {
    for (const edge of index.incoming.get(pending[cursor]) || []) {
      if (edge.kind === 'imports-package') {
        if (!consumers.has(edge.source)) consumers.set(edge.source, { ...edge, via: pending[cursor] });
      } else if (edge.kind === 'resolves-to' || (transitive && edge.kind === 'lock-dependency')) {
        if (!seen.has(edge.source)) { seen.add(edge.source); pending.push(edge.source); }
      }
    }
  }
  return [...consumers.values()].sort((a, b) => a.source.localeCompare(b.source));
}
