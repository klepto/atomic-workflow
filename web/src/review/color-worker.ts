import { highlighterOf, languageOfPath } from '@/lib/code-highlight.ts';
import type { ColorReply, ColorRequest } from '@/review/color-message.ts';
import { colorSides } from '@/review/file-highlight.ts';

// Entry point of the Web Worker that colors the files of the review, which `file-colorer.web-worker.ts` starts. It
// colors the requests of the page one after the other, and sends the colors of each run of lines as it goes.

/**
 * Requests that wait to color, in the order they came.
 */
const queue: ColorRequest[] = [];

/**
 * Whether the worker colors the requests of `queue` now.
 */
let draining = false;

/**
 * Sends the reply `message` to the page.
 */
const reply = (message: ColorReply): void => {
  globalThis.postMessage(message);
};

/**
 * Colors the request `request`, and sends its batches and then its end to the page. Ends it without colors when its
 * language gets none, or when the highlighter or the grammar fails to load or to color.
 */
const colorRequest = async (request: ColorRequest): Promise<void> => {
  const loadLanguage = languageOfPath(request.path);
  try {
    if (loadLanguage !== undefined) {
      const highlighter = await highlighterOf(loadLanguage);
      colorSides(highlighter, request.sides, (batch) => reply({ id: request.id, kind: 'batch', batch }));
    }
  } catch {
    // A file whose colors fail keeps its text without colors, and the user cannot act on the failure.
  }
  reply({ id: request.id, kind: 'end' });
};

/**
 * Colors the requests of `queue` one after the other, in the order they came, so that the files that show first color
 * first.
 */
const drain = async (): Promise<void> => {
  if (draining) return;
  draining = true;
  for (let request = queue.shift(); request !== undefined; request = queue.shift()) {
    await colorRequest(request);
  }
  draining = false;
};

globalThis.addEventListener('message', (event: MessageEvent<ColorRequest>) => {
  queue.push(event.data);
  void drain();
});
