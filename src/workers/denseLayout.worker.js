import { createDenseLayoutRuntime } from './denseLayoutRuntime.js';

const runtime = createDenseLayoutRuntime((message, transfer) => self.postMessage(message, transfer));
self.onmessage = event => runtime.receive(event.data);
