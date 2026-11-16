import { startTransition, useEffect, useState } from 'react';
import { systemClock } from '@/lib/clock.system.ts';
import { webWorkerFileColorer } from '@/review/file-colorer.web-worker.ts';
import type { FileHighlight } from '@/review/file-highlight.ts';
import { createHighlightStore } from '@/review/highlight-store.ts';
import type { FileDiff } from '@/review/patch.ts';

/**
 * Colors of the files of the page, kept for the life of the page, so that a file that shows again does not color
 * again.
 */
const store = createHighlightStore({ colorer: webWorkerFileColorer, clock: systemClock });

/**
 * Returns the colors of the lines of the file `file` so far, or `undefined` before the first colors arrive, and for a
 * file that gets no colors. The colors arrive in batches, each a new object that holds every line colored so far, at
 * most once each 100 ms. If the colors fail to load, the file keeps showing its text without colors.
 */
export const useFileHighlight = (file: FileDiff): FileHighlight | undefined => {
  const [colors, setColors] = useState(() => store.get(file));

  useEffect(() => {
    setColors(store.get(file));
    return store.subscribe(file, () => {
      // The colors of many lines render as a transition, so that the page keeps taking input meanwhile.
      startTransition(() => setColors(store.get(file)));
    });
  }, [file]);

  return colors;
};
