const endpoint = value => typeof value === 'object' ? value.id : value;

// A display-only partition: every source node has exactly one representative.
// File metrics and the underlying graph are never replaced by these aggregates.
export function projectFolders(graph, expanded = new Set(), selectedId = null) {
  const ids = new Set(graph.nodes.map(n => n.id));
  let prefix = '\0folder:';
  while ([...ids].some(id => String(id).startsWith(prefix))) prefix += ':';
  const folderId = path => prefix + path;
  const groups = new Map(), files = [], representatives = new Map();
  for (const node of graph.nodes) {
    const parts = (node.path || node.id).split('/');
    const ancestors = [];
    let collapsed = null;
    for (let i = 1; i < parts.length; i++) {
      const path = parts.slice(0, i).join('/');
      ancestors.push(folderId(path));
      if (collapsed === null && !expanded.has(path)) collapsed = path;
    }
    if (collapsed === null || node.id === selectedId) {
      files.push({ ...node, layoutAncestors: ancestors });
      representatives.set(node.id, node.id);
      continue;
    }
    let group = groups.get(collapsed);
    if (!group) {
      const depth = collapsed.split('/').length;
      group = { id: folderId(collapsed), path: collapsed, name: collapsed.split('/').at(-1),
        isFolder: true, fileCount: 0, matchCount: 0, internalCount: 0, internalTypes: Object.create(null),
        layoutAncestors: ancestors.slice(0, depth - 1) };
      groups.set(collapsed, group);
    }
    group.fileCount++; group.matchCount += Number(Boolean(node.isMatch));
    group.isMatch = group.matchCount > 0;
    representatives.set(node.id, group.id);
  }
  const nodes = [...groups.values()].sort((a, b) => a.path.localeCompare(b.path)).concat(files);
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const aggregated = new Map();
  let internalCount = 0, omittedEdges = 0;
  for (const edge of graph.edges) {
    let source = representatives.get(endpoint(edge.source)), target = representatives.get(endpoint(edge.target));
    if (source === undefined || target === undefined) { omittedEdges++; continue; }
    const type = edge.type || 'reference';
    if (source === target && nodeMap.get(source).isFolder) {
      const group = nodeMap.get(source);
      group.internalCount++; internalCount++;
      // Null-prototype dictionaries avoid special path/type names changing prototypes.
      group.internalTypes[type] = (group.internalTypes[type] || 0) + 1;
      continue;
    }
    if (edge.bidirectional && source > target) [source, target] = [target, source];
    const key = JSON.stringify([source, target, type, Boolean(edge.bidirectional)]);
    let relation = aggregated.get(key);
    if (!relation) {
      relation = { id: key, source, target, type, bidirectional: Boolean(edge.bidirectional), count: 0,
        aggregated: nodeMap.get(source).isFolder || nodeMap.get(target).isFolder || false };
      aggregated.set(key, relation);
    }
    relation.count++;
  }
  return { ...graph, snapshotId: graph.snapshotId || graph.nodes[0]?.snapshotId, nodes, edges: [...aggregated.values()], nodeMap, representatives,
    folderSummary: { files: graph.nodes.length, folders: groups.size, internalCount, omittedEdges,
      sourceEdges: graph.edges.length } };
}

export function collapseFolder(expanded, path) {
  return new Set([...expanded].filter(value => value !== path && !value.startsWith(path + '/')));
}

// Reuse exact positions first, then seed newly revealed children near the nearest
// previously visible ancestor. Camera and pinned file positions stay with Canvas.
export function savedFolderPosition(node, positions, index) {
  const exact = positions?.get(node.id);
  if (exact) return exact;
  for (const id of [...(node.layoutAncestors || [])].reverse()) {
    const parent = positions?.get(id);
    if (parent) {
      const angle = index * Math.PI * (3 - Math.sqrt(5));
      const radius = 18 + Math.sqrt(index % 100) * 4;
      return { x: parent.x + Math.cos(angle) * radius, y: parent.y + Math.sin(angle) * radius };
    }
  }
  return null;
}
