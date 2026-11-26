import { hierarchy, treemap } from 'd3';

// Treemap area follows group size. Inside each tile, paths keep a stable reading order.
export function atlasSeeds(nodes, width, height, groupMap = new Map()) {
  const groups = new Map();
  for (const node of nodes) {
    const group = groupMap.get(node.id) ?? (node.path?.includes('/') ? node.path.split('/')[0] : '(root)');
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(node);
  }
  const children = Array.from(groups, ([id, members]) => ({ id, members }));
  if (!children.length) return new Map();
  const root = hierarchy({ children }).sum(group => group.members?.length || 0)
    .sort((a, b) => b.value - a.value || a.data.id.localeCompare(b.data.id));
  const aspect = Math.max(0.5, Math.min(2, width / Math.max(1, height)));
  const tileWidth = Math.max(200, Math.sqrt(nodes.length * aspect) * 32);
  treemap().size([tileWidth, tileWidth / aspect])(root);
  const positions = new Map();
  for (const tile of root.leaves()) {
    const members = tile.data.members.sort((a, b) => a.id.localeCompare(b.id));
    const w = tile.x1 - tile.x0, h = tile.y1 - tile.y0;
    const cols = Math.min(members.length, Math.max(1, Math.round(Math.sqrt(members.length * w / h))));
    const rows = Math.ceil(members.length / cols);
    members.forEach((node, i) => positions.set(node.id, {
      x: tile.x0 + w * (0.04 + 0.92 * ((i % cols) + 0.5) / cols),
      y: tile.y0 + h * (0.04 + 0.92 * (Math.floor(i / cols) + 0.5) / rows),
    }));
  }
  return positions;
}
