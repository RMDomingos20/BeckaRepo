export function startDenseLayout(nodes, edges, onPositions, onStatus,
  createWorker = () => new Worker(new URL('../workers/denseLayout.worker.js', import.meta.url), { type: 'module' })) {
  let worker, disposed = false, failed = false, revision = 0, receivedBytes = 0, watchdog;
  const indices = new Map(nodes.map((n, i) => [n.id, i]));
  const fail = () => {
    if (disposed || failed) return;
    failed = true; clearTimeout(watchdog); worker?.terminate();
    onStatus({ state: 'unavailable', receivedBytes });
  };
  const armWatchdog = () => { clearTimeout(watchdog); watchdog = setTimeout(fail, 30000); };
  try {
    const geometry = new Float64Array(nodes.length * 4), links = new Uint32Array(edges.length * 2);
    nodes.forEach((n, i) => geometry.set([n.x, n.y, n.fx ?? NaN, n.fy ?? NaN], i * 4));
    edges.forEach((e, i) => links.set([indices.get(e.source.id), indices.get(e.target.id)], i * 2));
    worker = createWorker();
    worker.onerror = event => { event.preventDefault?.(); fail(); };
    worker.onmessageerror = fail;
    worker.onmessage = ({ data }) => {
      if (disposed || failed) return;
      if (data.type === 'error') { fail(); return; }
      if (data.type !== 'positions') return;
      const p = data.positions;
      if (!(p instanceof Float64Array) || p.length !== nodes.length * 2 || !p.every(Number.isFinite)) { fail(); return; }
      receivedBytes += p.byteLength;
      // A late frame must never undo a drag/release made since it was computed.
      if (data.revision === revision) {
        const started = performance.now();
        nodes.forEach((n, i) => { n.x = n.fx ?? p[i * 2]; n.y = n.fy ?? p[i * 2 + 1]; });
        onPositions();
        onStatus({ state: data.settled ? 'settled' : 'running', ticks: data.ticks,
          computeMs: data.computeMs, applyMs: performance.now() - started, receivedBytes });
      }
      worker.postMessage({ type: 'ack', sequence: data.sequence });
      if (data.settled && data.revision === revision) clearTimeout(watchdog); else armWatchdog();
    };
    worker.postMessage({ type: 'init', geometry, links }, [geometry.buffer, links.buffer]);
    armWatchdog();
  } catch { fail(); }
  return {
    pin(node) {
      if (disposed || failed) return;
      try {
        worker.postMessage({ type: 'pin', index: indices.get(node.id), revision: ++revision,
          x: node.x, y: node.y, fixed: node.fx != null });
        armWatchdog();
      } catch { fail(); }
    },
    stop() { disposed = true; clearTimeout(watchdog); worker?.terminate(); },
  };
}
