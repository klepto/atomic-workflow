import type { BrowserStore } from '@/lib/browser-store.ts';

/**
 * `BrowserStore` over the local storage of the browser, which keeps each string for every later visit of the origin.
 */
export const localStorageBrowserStore: BrowserStore = {
  read: (key) => {
    try {
      return window.localStorage.getItem(key) ?? undefined;
    } catch {
      // A browser that refuses the local storage holds nothing for the page.
      return undefined;
    }
  },
  write: (key, value) => {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  remove: (key) => {
    try {
      window.localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },
};
