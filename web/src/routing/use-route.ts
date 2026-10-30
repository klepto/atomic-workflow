import { useMemo, useSyncExternalStore } from 'react';
import { currentPath, subscribePath } from '@/routing/navigation.ts';
import { parseRoute, type Route } from '@/routing/route.ts';

/**
 * Returns the route of the current URL, and renders again when `navigate`, or back and forward in the browser, change
 * it.
 */
export const useRoute = (): Route => {
  const pathname = useSyncExternalStore(subscribePath, currentPath);
  return useMemo(() => parseRoute(pathname), [pathname]);
};
