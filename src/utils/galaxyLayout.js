const TAU = 2 * Math.PI;
const endpoint = value => typeof value === 'object' ? value.id : value;

function angleFraction(id) {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296;
}

function connect(source, target) {
  (source.outgoing ??= new Set()).add(target.id);
  (target.incoming ??= new Set()).add(source.id);
}

function groupSectors(counts, total) {
  const sectors = new Map();
  let start = 0;
  for (const group of [...counts.keys()].sort()) {
    const span = counts.get(group) / total * TAU;
    sectors.set(group, { start, span });
    start += span;
  }
  return sectors;
}

export function galaxySeeds(nodes, edges, width, height, clusterMap = new Map()) {
  const counts = new Map();
  const records = new Map();
  for (const node of nodes) {
    const folder = node.path?.includes('/') ? node.path.split('/')[0] : '(root)';
    const group = clusterMap.get(node.id) ?? folder;
    counts.set(group, (counts.get(group) || 0) + 1);
    records.set(node.id, { id: node.id, group });
  }
  for (const edge of edges) {
    const source = records.get(endpoint(edge.source));
    const target = records.get(endpoint(edge.target));
    if (!source || !target || source === target) continue;
    connect(source, target);
    if (edge.bidirectional) connect(target, source);
  }

  let connected = 0;
  const ranked = [...records.values()];
  for (const record of ranked) {
    record.score = 2 * (record.incoming?.size || 0) + (record.outgoing?.size || 0);
    if (record.score) connected++;
  }
  ranked.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const sectors = groupSectors(counts, nodes.length);
  const radius = Math.max(180, Math.sqrt(nodes.length) * 18);
  const positions = new Map();
  ranked.forEach((record, index) => {
    // Give isolates their own outer band, independent of the number of connected files.
    const fraction = record.score
      ? 0.06 + 0.88 * Math.sqrt(index / Math.max(1, connected - 1))
      : 1.12 + 0.22 * Math.sqrt((index - connected) / Math.max(1, ranked.length - connected - 1));
    const sector = sectors.get(record.group);
    let withinSector = angleFraction(record.id);
    // Give wide, crowded sectors a few visible lanes. All sectors turn by
    // the same angle at a given radius, preserving their order around the core.
    const lanes = Math.floor(sector.span / 1.4);
    if (record.score && connected > 1500 && lanes >= 2) {
      const lane = withinSector * lanes;
      withinSector = (Math.floor(lane) + 0.18 + 0.64 * (lane % 1)) / lanes;
    }
    const twist = connected > 1500 ? 2.1 : 0.65;
    const angle = sector.start + sector.span * (0.06 + 0.88 * withinSector) + twist * fraction;
    positions.set(record.id, {
      x: width / 2 + Math.cos(angle) * radius * fraction,
      y: height / 2 + Math.sin(angle) * radius * fraction,
      relevance: record.score,
    });
  });
  return positions;
}
