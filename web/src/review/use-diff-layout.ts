import { useState } from 'react';
import { localStorageBrowserStore } from '@/lib/browser-store.local-storage.ts';

/**
 * How the diff shows the lines of a file: `unified` in one column, `split` with the old lines beside the new ones.
 */
export type DiffLayout = 'unified' | 'split';

/**
 * Key of the entry of the browser store that holds the layout of the diff that the user chose last.
 */
const LAYOUT_KEY = 'atomic-workflow:diff-layout';

/**
 * Returns the layout of the diff that the user chose last, `unified` by default, with the function that changes it and
 * keeps it in the browser store. A store that refuses the write keeps the layout for this page only.
 */
export const useDiffLayout = (): [DiffLayout, (layout: DiffLayout) => void] => {
  const [layout, setLayout] = useState<DiffLayout>(() =>
    localStorageBrowserStore.read(LAYOUT_KEY) === 'split' ? 'split' : 'unified',
  );

  /**
   * Shows the diff in the layout `next`, and keeps it for the next review.
   */
  const choose = (next: DiffLayout): void => {
    setLayout(next);
    localStorageBrowserStore.write(LAYOUT_KEY, next);
  };

  return [layout, choose];
};
