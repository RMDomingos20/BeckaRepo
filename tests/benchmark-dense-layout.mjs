// Synthetic Node baseline; deliberately not a WebView FPS or total-memory benchmark.
import { Worker } from 'node:worker_threads';
import os from 'node:os';
import { createDenseLayoutRuntime } from '../src/workers/denseLayoutRuntime.js';

async function measure(count, edgeCount, mode) {
  const geometry = new Float64Array(count * 4), links = new Uint32Array(edgeCount * 2);
  for (let i = 0; i < count; i++) {
    const angle = i * Math.PI * (3 - Math.sqrt(5)), radius = Math.sqrt(i) * (count > 15000 ? 22 : 12);
    geometry.set([Math.cos(angle) * radius, Math.sin(angle) * radius, NaN, NaN], i * 4);
  }
  for (let i = 0; i < edgeCount; i++) links.set([i % count, (i * 31 + 1) % count], i * 2);
  let last = performance.now(), maxGap = 0, frames = 0, receivedBytes = 0, final;
  const heart = setInterval(() => { const now = performance.now(); maxGap = Math.max(maxGap, now - last); last = now; }, 16);
  const started = performance.now();
  let stop, receive;
  try {
    await new Promise((resolve, reject) => {
      const handle = frame => {
        if (frame.type === 'error') { reject(new Error('Layout failed')); return; }
        frames++; receivedBytes += frame.positions.byteLength; final = frame;
        if (frame.settled) resolve();
        else setTimeout(() => receive({ type: 'ack', sequence: frame.sequence }), 0);
      };
      if (mode === 'worker') {
        const worker = new Worker(new URL('./helpers/dense-worker.mjs', import.meta.url));
        worker.on('message', handle); worker.on('error', reject);
        stop = () => worker.terminate(); receive = data => worker.postMessage(data);
        worker.postMessage({ type: 'init', geometry, links }, [geometry.buffer, links.buffer]);
      } else {
        const runtime = createDenseLayoutRuntime(handle);
        stop = runtime.stop; receive = runtime.receive;
        receive({ type: 'init', geometry, links });
      }
    });
    return { count, edgeCount, mode, elapsedMs: Math.round(performance.now() - started),
      computeMs: Math.round(final.computeMs), ticks: final.ticks, frames, receivedBytes,
      mainHeartbeatMaxGapMs: Math.round(maxGap) };
  } finally { clearInterval(heart); await stop?.(); }
}

const results = [];
for (const [count, edges] of [[1000, 1500], [10000, 15000], [85224, 91745]]) {
  for (const mode of ['main', 'worker']) results.push(await measure(count, edges, mode));
}
console.log(JSON.stringify({ date: new Date().toISOString(), node: process.version, cpu: os.cpus()[0]?.model,
  memoryGiB: Math.round(os.totalmem() / 1024 ** 3), note: 'One synthetic run per case, Node runtime; no browser drawing, no FPS claim. Main/worker use identical forces and scheduling.', results }, null, 2));
