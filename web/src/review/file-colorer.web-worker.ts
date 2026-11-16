import type { ColorReply, ColorRequest } from '@/review/color-message.ts';
import type { FileColorer } from '@/review/file-colorer.ts';
import type { ColorBatch } from '@/review/file-highlight.ts';

/**
 * Receivers of the batches of the requests that wait for their end, by the identifier of the request.
 */
const pending = new Map<number, (batch: ColorBatch) => void>();

/**
 * Identifier of the last request.
 */
let lastId = 0;

/**
 * Worker that colors the files of the page, created on the first file to color, `null` once it failed, or `undefined`
 * before.
 */
let worker: Worker | null | undefined;

/**
 * Drops every request that waits, and keeps every later request from starting, once the worker failed.
 */
const fail = (): void => {
  worker = null;
  pending.clear();
};

/**
 * Hands the reply `message` of the worker to the receiver of its request, and drops the request at its end.
 */
const receive = (message: ColorReply): void => {
  if (message.kind === 'end') {
    pending.delete(message.id);
    return;
  }
  pending.get(message.id)?.(message.batch);
};

/**
 * Returns the worker of the page, created on the first call, or `null` once it failed.
 */
const workerOfPage = (): Worker | null => {
  if (worker !== undefined) return worker;
  try {
    const created = new Worker(new URL('./color-worker.ts', import.meta.url), { type: 'module' });
    created.addEventListener('message', (event: MessageEvent<ColorReply>) => receive(event.data));
    created.addEventListener('error', fail);
    created.addEventListener('messageerror', fail);
    worker = created;
  } catch {
    // A page without a worker shows its code without colors, and the user cannot act on the failure.
    worker = null;
  }
  return worker;
};

/**
 * `FileColorer` that colors the files of the page in one Web Worker, one file after the other, in the order of the
 * requests. If the worker fails to load or to run, the files that wait and every later file get no colors.
 */
export const webWorkerFileColorer: FileColorer = {
  color: (path, sides, onBatch) => {
    const target = workerOfPage();
    if (target === null) return;
    lastId += 1;
    pending.set(lastId, onBatch);
    const request: ColorRequest = { id: lastId, path, sides };
    target.postMessage(request);
  },
};
