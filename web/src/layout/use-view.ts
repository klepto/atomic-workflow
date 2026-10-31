import { useEffect, useRef } from 'react';
import type { ListedSession, TaskSummary } from '@/api/types.ts';
import { type ResolvedChat, resolveView, type View } from '@/layout/view.ts';
import { currentPath, navigate } from '@/routing/navigation.ts';
import { useRoute } from '@/routing/use-route.ts';

/**
 * Resolves the route of the URL against the sessions `sessions` and the tasks `tasks` into the view that it names, as
 * `resolveView` does, and replaces the URL with the canonical path of that view, with no new history entry, whenever
 * the two differ. Until both the sessions and the tasks are known, the URL stays as it is. A chat that the server
 * renames while it is open stays open, since the ref that resolved to it in the latest render still names it. Returns
 * the view.
 */
export const useView = (
  sessions: readonly ListedSession[] | undefined,
  tasks: readonly TaskSummary[] | undefined,
): View => {
  const route = useRoute();
  const lastResolved = useRef<ResolvedChat>(undefined);
  const { view, canonical, resolved } = resolveView(route, sessions, tasks, lastResolved.current);
  useEffect(() => {
    lastResolved.current = resolved;
  });
  // Runs again on each new route too, since back and forward can lead to a path that is not canonical.
  // biome-ignore lint/correctness/useExhaustiveDependencies: route reruns the effect on each navigation.
  useEffect(() => {
    if (canonical !== undefined && canonical !== currentPath()) {
      navigate(canonical, { replace: true });
    }
  }, [canonical, route]);
  return view;
};
