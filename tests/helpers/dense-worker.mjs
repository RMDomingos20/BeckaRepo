import { parentPort } from 'node:worker_threads';
import { createDenseLayoutRuntime } from '../../src/workers/denseLayoutRuntime.js';

const runtime = createDenseLayoutRuntime((data, transfer) => parentPort.postMessage(data, transfer));
parentPort.on('message', data => runtime.receive(data));
