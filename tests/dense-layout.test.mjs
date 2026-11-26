import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { setTimeout as delay } from 'node:timers/promises';
import { startDenseLayout } from '../src/utils/denseLayoutClient.js';

function geometry(count) {
  const values = new Float64Array(count * 4);
  for (let i = 0; i < count; i++) values.set([i * 3, i % 7, NaN, NaN], i * 4);
  return values;
}
function workerHarness(t) {
  const worker = new Worker(new URL('./helpers/dense-worker.mjs', import.meta.url));
  t.after(() => worker.terminate());
  const queue = [], waiters = [];
  worker.on('message', data => { if (waiters.length) waiters.shift()(data); else queue.push(data); });
  return { worker, queue, next: () => queue.length ? Promise.resolve(queue.shift()) : new Promise(resolve => waiters.push(resolve)) };
}

test('F8 real worker transfers finite coordinates, bounds in-flight frames and preserves pins', { timeout: 15000 }, async t => {
  const { worker, queue, next } = workerHarness(t);
  const initial = geometry(1000), links = new Uint32Array([0, 1, 1, 2, 2, 2]);
  worker.postMessage({ type: 'init', geometry: initial, links }, [initial.buffer, links.buffer]);
  assert.equal(initial.byteLength, 0); // actual ownership transfer, not a mock
  const first = await next();
  assert.equal(first.positions.length, 2000);
  assert.ok(first.positions.every(Number.isFinite));
  await delay(180);
  assert.equal(queue.length, 0, 'no additional buffer before acknowledgment');
  worker.postMessage({ type: 'pin', index: 0, x: 999, y: -456, fixed: true, revision: 1 });
  worker.postMessage({ type: 'ack', sequence: first.sequence });
  let frame = await next();
  assert.equal(frame.revision, 1);
  assert.equal(frame.positions[0], 999); assert.equal(frame.positions[1], -456);
  while (!frame.settled) { worker.postMessage({ type: 'ack', sequence: frame.sequence }); frame = await next(); }
  assert.equal(frame.positions[0], 999);
  worker.postMessage({ type: 'pin', index: 0, x: 999, y: -456, fixed: false, revision: 2 });
  worker.postMessage({ type: 'ack', sequence: frame.sequence });
  frame = await next();
  assert.equal(frame.revision, 2); assert.equal(frame.settled, false);
  assert.ok(frame.positions.every(Number.isFinite));
  assert.ok(frame.ticks > 0 && frame.computeMs > 0);
});

test('F8 ultra layout keeps all 85224 nodes including isolated nodes', { timeout: 15000 }, async t => {
  const { worker, next } = workerHarness(t);
  const initial = geometry(85224), links = new Uint32Array([0, 1, 1, 2]);
  worker.postMessage({ type: 'init', geometry: initial, links }, [initial.buffer, links.buffer]);
  const frame = await next();
  assert.equal(frame.positions.length, 85224 * 2);
  assert.ok(frame.positions.every(Number.isFinite));
  assert.equal(frame.positions.at(-2), 85223 * 3);
});

test('F8 invalid worker topology fails explicitly without NaN frames', { timeout: 10000 }, async t => {
  const { worker, next } = workerHarness(t);
  worker.postMessage({ type: 'init', geometry: geometry(2), links: new Uint32Array([0, 5]) });
  assert.deepEqual(await next(), { type: 'error' });
});

test('F8 renderer discards stale drag frames and frames after cleanup; camera metadata stays local', () => {
  const sent = [], updates = [], status = [];
  let terminated = 0;
  const fake = { postMessage: data => sent.push(data), terminate: () => terminated++ };
  const nodes = [{ id: 'private/path.rs', x: 1, y: 2, fx: null, fy: null }];
  const layout = startDenseLayout(nodes, [], () => updates.push(true), data => status.push(data), () => fake);
  assert.deepEqual(Object.keys(sent[0]).sort(), ['geometry', 'links', 'type']);
  nodes[0].x = nodes[0].fx = 100; nodes[0].y = nodes[0].fy = 200;
  layout.pin(nodes[0]);
  const response = revision => ({ data: { type: 'positions', positions: new Float64Array([3, 4]), revision, sequence: 1, settled: true, ticks: 10, computeMs: 4 } });
  fake.onmessage(response(0));
  assert.equal(nodes[0].x, 100); assert.equal(updates.length, 0);
  fake.onmessage(response(1));
  assert.equal(nodes[0].x, 100); assert.equal(updates.length, 1);
  nodes[0].fx = nodes[0].fy = null;
  layout.pin(nodes[0]);
  fake.onmessage(response(1)); assert.equal(nodes[0].x, 100);
  fake.onmessage(response(2)); assert.equal(nodes[0].x, 3);
  layout.stop(); fake.onmessage(response(2));
  assert.equal(updates.length, 2); assert.equal(terminated, 1);
  assert.equal(status.at(-1).state, 'settled');
});

test('F8 worker startup/runtime failures preserve the usable static layout', () => {
  const nodes = [{ id: 'a', x: 7, y: 8 }], statuses = [];
  const layout = startDenseLayout(nodes, [], () => assert.fail('unexpected update'), x => statuses.push(x), () => { throw new Error('worker blocked'); });
  assert.equal(statuses[0].state, 'unavailable'); assert.equal(nodes[0].x, 7);
  layout.pin(nodes[0]); layout.stop();
  let terminated = false;
  const fake = { postMessage() {}, terminate() { terminated = true; } };
  const second = startDenseLayout(nodes, [], () => {}, x => statuses.push(x), () => fake);
  fake.onmessage({ data: { type: 'positions', positions: new Float64Array([NaN, 1]) } });
  assert.equal(statuses.at(-1).state, 'unavailable'); assert.equal(terminated, true);
  assert.equal(nodes[0].x, 7); second.stop();
});
