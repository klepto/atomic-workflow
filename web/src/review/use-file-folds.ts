import { useCallback, useState } from 'react';
import { foldReasonOf } from '@/review/fold-reason.ts';
import type { ReviewFile } from '@/review/use-changes.ts';
import { useStableCallback } from '@/review/use-stable-callback.ts';

/**
 * Which changed files of a review are folded, with the functions that fold and show them.
 */
interface FileFolds {
  /**
   * Returns whether the file `file` is folded.
   */
  readonly isFolded: (file: ReviewFile) => boolean;

  /**
   * Folds the file `path` when it shows, and shows it when it is folded. It stays the same for the life of the
   * component.
   */
  readonly toggle: (path: string) => void;

  /**
   * Shows the file `path` if it is folded. It stays the same for the life of the component.
   */
  readonly unfold: (path: string) => void;
}

/**
 * Returns which of the changed files `files` are folded: each file as the reviewer last folded or showed it while the
 * page stays open, else folded when `foldReasonOf` gives it a reason, with the functions that fold and show a file.
 */
export const useFileFolds = (files: readonly ReviewFile[]): FileFolds => {
  const [choices, setChoices] = useState<ReadonlyMap<string, boolean>>(new Map());

  /**
   * Returns whether the file `file` is folded.
   */
  const isFolded = (file: ReviewFile): boolean => choices.get(file.summary.path) ?? foldReasonOf(file) !== undefined;

  const toggle = useStableCallback((path: string): void => {
    const file = files.find((other) => other.summary.path === path);
    if (file !== undefined) setChoices((current) => new Map([...current, [path, !isFolded(file)]]));
  });

  const unfold = useCallback((path: string): void => setChoices((current) => new Map([...current, [path, false]])), []);

  return { isFolded, toggle, unfold };
};
