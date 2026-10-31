import { startTransition, useEffect, useState } from 'react';

/**
 * Cache of the colors of code that was colored once, by the key that names the code. A `Map` and a `WeakMap` both
 * fit.
 */
interface HighlightCache<Key, Colors> {
  /**
   * Returns the colors of the code that `key` names, or `undefined` while the cache holds none.
   */
  get(key: Key): Colors | undefined;

  /**
   * Keeps `colors` as the colors of the code that `key` names.
   */
  set(key: Key, colors: Colors): unknown;
}

/**
 * Returns the colors of the code that `key` names, or `undefined` while they load. Reads them from `cache`, or else
 * colors the code with `color`, keeps its result in `cache`, and renders again once it resolves. `color` receives `key`,
 * and returns `undefined` for code that gets no colors, such as code in a language without a grammar or code longer
 * than `MAX_HIGHLIGHT_LINES`. The colors render as a transition, which input interrupts. Pass a `color` that stays
 * the same across renders, such as a function of a module, since a new function starts to color again. If the colors
 * fail to load, the code keeps showing without colors.
 */
export const useHighlight = <Key, Colors>(
  key: Key,
  cache: HighlightCache<Key, Colors>,
  color: (key: Key) => Promise<Colors> | undefined,
): Colors | undefined => {
  const [colors, setColors] = useState(() => cache.get(key));

  useEffect(() => {
    const known = cache.get(key);
    setColors(known);
    if (known !== undefined) return;
    const loading = color(key);
    if (loading === undefined) return;
    let current = true;
    loading.then(
      (loaded) => {
        cache.set(key, loaded);
        // The colors of many lines render as a transition, so that the page keeps taking input meanwhile.
        if (current) startTransition(() => setColors(loaded));
      },
      // Code without colors still shows its text, and the user cannot act on the failure.
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [key, cache, color]);

  return colors;
};
