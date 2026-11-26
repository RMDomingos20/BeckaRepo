import { forceSimulation, forceLink, forceX, forceY, forceManyBody, forceCollide } from 'd3';

// Transport contains only numeric geometry/topology, never paths or source text.
// Acknowledgments bound the number of transferable position buffers in flight to one.
export function createDenseLayoutRuntime(send) {
  let sim, nodes, timer, waiting = false, revision = 0, sequence = 0;
  let dirty = true, lastSent = -Infinity, ticks = 0, computeMs = 0, stopped = false;
  const stop = () => { stopped = true; clearTimeout(timer); sim?.stop(); };
  const schedule = () => { clearTimeout(timer); if (!stopped) timer = setTimeout(step, 12); };
  function publish() {
    const positions = new Float64Array(nodes.length * 2);
    nodes.forEach((n, i) => { positions[i * 2] = n.x; positions[i * 2 + 1] = n.y; });
    waiting = true; dirty = false; lastSent = performance.now();
    send({ type: 'positions', sequence: ++sequence, revision, positions,
      settled: sim.alpha() < sim.alphaMin(), ticks, computeMs }, [positions.buffer]);
  }
  function step() {
    if (stopped) return;
    if (sim.alpha() >= sim.alphaMin()) {
      const start = performance.now();
      sim.tick(); ticks++; computeMs += performance.now() - start; dirty = true;
    }
    const active = sim.alpha() >= sim.alphaMin();
    if (!waiting && dirty && (!active || performance.now() - lastSent >= 80)) publish();
    if (active || (!waiting && dirty)) schedule();
  }
  function receive(message) {
    if (stopped) return;
    try {
      if (message.type === 'init') {
        if (sim) throw new Error('Layout already initialized');
        const { geometry, links } = message;
        if (!(geometry instanceof Float64Array) || geometry.length % 4 || geometry.length > 400000 ||
            !(links instanceof Uint32Array) || links.length % 2) throw new Error('Invalid layout input');
        nodes = Array.from({ length: geometry.length / 4 }, (_, i) => {
          const [x, y, fx, fy] = geometry.subarray(i * 4, i * 4 + 4);
          if (![x, y].every(Number.isFinite) || (!Number.isNaN(fx) && !Number.isFinite(fx)) ||
              (!Number.isNaN(fy) && !Number.isFinite(fy))) throw new Error('Invalid position');
          return { x, y, anchorX: x, anchorY: y, fx: Number.isNaN(fx) ? null : fx, fy: Number.isNaN(fy) ? null : fy };
        });
        const edges = Array.from({ length: links.length / 2 }, (_, i) => {
          const source = links[i * 2], target = links[i * 2 + 1];
          if (source >= nodes.length || target >= nodes.length) throw new Error('Invalid link');
          return { source, target };
        });
        const ultra = nodes.length > 15000;
        sim = forceSimulation(nodes).stop()
          .force('link', forceLink(edges).distance(ultra ? 70 : 85).strength(ultra ? 0.05 : 0.3))
          .force('x', forceX(n => n.anchorX).strength(ultra ? 0.08 : 0.015))
          .force('y', forceY(n => n.anchorY).strength(ultra ? 0.08 : 0.015))
          .alphaDecay(ultra ? 0.09 : 0.045);
        if (!ultra) sim.force('charge', forceManyBody().strength(-70).distanceMax(220))
          .force('collide', forceCollide(7).iterations(1));
        schedule();
      } else if (message.type === 'ack' && message.sequence === sequence && waiting) {
        waiting = false; schedule();
      } else if (message.type === 'pin' && sim) {
        const node = nodes[message.index];
        if (!node || !Number.isInteger(message.revision) || message.revision <= revision ||
            !Number.isFinite(message.x) || !Number.isFinite(message.y)) return;
        revision = message.revision;
        node.x = message.x; node.y = message.y; node.vx = 0; node.vy = 0;
        node.fx = message.fixed ? node.x : null; node.fy = message.fixed ? node.y : null;
        if (!message.fixed) {
          node.anchorX = node.x; node.anchorY = node.y;
          // forceX/Y cache their targets; refresh after moving an anchor.
          sim.force('x').x(n => n.anchorX); sim.force('y').y(n => n.anchorY);
        }
        sim.alpha(Math.max(sim.alpha(), 0.3)); dirty = true; schedule();
      }
    } catch {
      stop(); send({ type: 'error' });
    }
  }
  return { receive, stop };
}
