import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Returns a function that stays the same for the life of the component, and calls the latest `callback` that the
 * component rendered with.
 */
export const useStableCallback = <Arguments extends unknown[]>(
  callback: (...values: Arguments) => void,
): ((...values: Arguments) => void) => {
  const latest = useRef(callback);
  useLayoutEffect(() => {
    latest.current = callback;
  });
  return useCallback((...values: Arguments) => latest.current(...values), []);
};
