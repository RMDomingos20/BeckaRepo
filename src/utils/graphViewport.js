// Budgets apply to the drawing only; the source graph and its filters stay intact.
export const DRAW_LIMITS = Object.freeze({ autoEdges: 1200, allEdges: 12000, focusEdges: 5000, labels: 80 });

export function screenRadius(node, active = false) {
  return active ? 6 : node.isMatch ? 4.5 : Math.min(5, 2.8 + Math.sqrt(node.weight || 0) * 0.15);
}

export function viewportNodes(tree, transform, width, height, margin = 24) {
  const x0 = transform.invertX(-margin), y0 = transform.invertY(-margin);
  const x1 = transform.invertX(width + margin), y1 = transform.invertY(height + margin);
  const nodes = [];
  tree.visit((quad, left, top, right, bottom) => {
    if (left > x1 || right < x0 || top > y1 || bottom < y0) return true;
    if (!quad.length) {
      do {
        const node = quad.data;
        if (node.x >= x0 && node.x <= x1 && node.y >= y0 && node.y <= y1) nodes.push(node);
      } while ((quad = quad.next));
    }
    return false;
  });
  return nodes;
}

// Liang–Barsky: keep lines crossing the viewport even with both endpoints outside.
export function clipSegment(ax, ay, bx, by, width, height) {
  const dx = bx - ax, dy = by - ay;
  let start = 0, end = 1;
  const p = [-dx, dx, -dy, dy], q = [ax, width - ax, ay, height - ay];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return null; }
    else {
      const ratio = q[i] / p[i];
      if (p[i] < 0) start = Math.max(start, ratio);
      else end = Math.min(end, ratio);
      if (start > end) return null;
    }
  }
  return [ax + start * dx, ay + start * dy, ax + end * dx, ay + end * dy];
}

export function screenGroups(nodes, transform, aggregate, promoted) {
  const cells = new Map(), marks = [];
  for (const node of nodes) {
    const x = transform.applyX(node.x), y = transform.applyY(node.y);
    if (!aggregate || promoted.has(node.id)) {
      marks.push({ x, y, node, count: 1, radius: screenRadius(node, promoted.has(node.id)) });
      continue;
    }
    const key = `${Math.floor(x / 24)},${Math.floor(y / 24)}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = { x: 0, y: 0, count: 0, matches: 0, node, representativeId: node.id };
      cells.set(key, cell);
    }
    cell.x += x; cell.y += y; cell.count++;
    if (node.isMatch) cell.matches++;
  }
  for (const cell of cells.values()) {
    cell.x /= cell.count; cell.y /= cell.count;
    cell.radius = cell.count > 1 ? Math.min(11, 6 + Math.log2(cell.count)) : screenRadius(cell.node);
    if (cell.count > 1) cell.node = null;
    marks.push(cell);
  }
  // Draw real highlighted nodes last so groups cannot cover their hit targets.
  marks.sort((a, b) => Number(Boolean(a.node && promoted.has(a.node.id))) - Number(Boolean(b.node && promoted.has(b.node.id))));
  return marks;
}

export function labelPlacer(width, height) {
  const occupied = new Map();
  return (x, y, w, h) => {
    if (x < 0 || y < 0 || x + w > width || y + h > height) return false;
    const keys = [];
    for (let col = Math.floor(x / 64); col <= Math.floor((x + w) / 64); col++) {
      for (let row = Math.floor(y / 24); row <= Math.floor((y + h) / 24); row++) keys.push(`${col},${row}`);
    }
    for (const key of keys) {
      for (const rect of occupied.get(key) || []) {
        if (x < rect.x + rect.w && x + w > rect.x && y < rect.y + rect.h && y + h > rect.y) return false;
      }
    }
    const rect = { x, y, w, h };
    for (const key of keys) { if (!occupied.has(key)) occupied.set(key, []); occupied.get(key).push(rect); }
    return true;
  };
}
