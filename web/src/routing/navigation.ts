/**
 * Options of a move to a path.
 */
interface NavigateOptions {
  /**
   * Whether the move replaces the current history entry in place of a push of a new one. `false` by default.
   */
  readonly replace?: boolean;
}

/**
 * Functions to call when `navigate` changes the path.
 */
const listeners = new Set<() => void>();

/**
 * Calls `listener` whenever the path changes, by `navigate` or by back and forward in the browser. Returns the function
 * that stops the calls.
 */
export const subscribePath = (listener: () => void): (() => void) => {
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
export const currentPath = (): string => window.location.pathname;

/**
 * Moves to `path` without a page load, and tells every component that calls `useRoute`. Pushes a history entry, or
 * replaces the current one when `options` has `replace` set to `true`. A move to the current path replaces its entry
 * too, as a link to the current page does in the browser, so it adds no entry that back would only return to the same
 * view from.
 */
export const navigate = (path: string, options?: NavigateOptions): void => {
  if (options?.replace === true || path === currentPath()) {
    window.history.replaceState(null, '', path);
  } else {
    window.history.pushState(null, '', path);
  }
  for (const listener of listeners) {
    listener();
  }
};
