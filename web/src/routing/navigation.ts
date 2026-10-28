import { useMemo, useSyncExternalStore } from 'react';
import { parseRoute, type Route } from '@/routing/route.ts';

/**
 * The functions to call when `navigate` changes the path.
 */
const listeners = new Set<() => void>();

/**
 * Calls `listener` whenever the path changes, by `navigate` or by back and forward in the browser. Returns the function
 * that stops the calls.
 */
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
};

/**
 * Returns the path of the current URL.
 */
const getPathname = () => window.location.pathname;

/**
 * Moves to `path` without a page load, and tells every component that calls `useRoute`. Pushes a history entry, or
 * replaces the current one with `{ replace: true }`. A move to the current path replaces its entry too, as a link to
 * the current page does in the browser, so it adds no entry that back would only return to the same view from.
 */
export const navigate = (path: string, options?: { replace?: boolean }): void => {
  if (options?.replace === true || path === window.location.pathname) {
    window.history.replaceState(null, '', path);
  } else {
    window.history.pushState(null, '', path);
  }
  for (const listener of listeners) {
    listener();
  }
};

/**
 * Returns the route of the current URL, and renders again when `navigate`, or back and forward in the browser, change
 * it.
 */
export const useRoute = (): Route => {
  const pathname = useSyncExternalStore(subscribe, getPathname);
  return useMemo(() => parseRoute(pathname), [pathname]);
};
