/**
 * Whether the stream of the open page is connected.
 */
let online = true;

/**
 * Functions to call when the connection changes.
 */
const listeners = new Set<() => void>();

/**
 * Sets the connection to `value`, and tells every listener when it changed.
 */
export const setOnline = (value: boolean): void => {
  if (online === value) return;
  online = value;
  for (const listener of listeners) {
    listener();
  }
};

/**
 * Calls `listener` whenever the connection changes. Returns the function that stops the calls.
 */
export const subscribeConnection = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Returns whether the stream of the open page is connected.
 */
export const isOnline = (): boolean => online;
