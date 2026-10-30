import { localStorageBrowserStore } from '@/lib/browser-store.local-storage.ts';

/**
 * Name of a theme of the app. The attribute `data-theme` of the root element holds it.
 */
export type ThemeName = 'zen' | 'claude';

/**
 * Theme that the user can pick.
 */
interface Theme {
  /**
   * Name of the theme.
   */
  readonly name: ThemeName;

  /**
   * Name of the theme that the app shows.
   */
  readonly label: string;
}

/**
 * Themes that the user can pick, the default first.
 */
export const THEMES: readonly Theme[] = [
  { name: 'zen', label: 'Default' },
  { name: 'claude', label: 'Claude' },
];

/**
 * Theme of the app while the user picked none.
 */
const DEFAULT_THEME: ThemeName = 'zen';

/**
 * Key of the entry of the browser store that holds the theme that the user picked. It keeps its dot, unlike the keys
 * of the form `atomic-workflow:<name>`, so that the pick of each user stays.
 */
const THEME_STORAGE_KEY = 'atomic-workflow.theme';

/**
 * Functions to call when the theme changes.
 */
const listeners = new Set<() => void>();

/**
 * Returns whether `value` is the name of a theme.
 */
const isThemeName = (value: unknown): value is ThemeName => THEMES.some((theme) => theme.name === value);

/**
 * Returns the theme that the user picked. If the user picked none, or the browser refuses its store, returns the
 * default theme instead.
 */
const readStoredTheme = (): ThemeName => {
  const stored = localStorageBrowserStore.read(THEME_STORAGE_KEY);
  return isThemeName(stored) ? stored : DEFAULT_THEME;
};

/**
 * Shows the app in the dark variant of the theme `theme`.
 */
const applyTheme = (theme: ThemeName): void => {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.add('dark');
};

/**
 * Shows the app in the theme that the user picked, or in the default theme if the user picked none.
 */
export const applyStoredTheme = (): void => applyTheme(readStoredTheme());

/**
 * Returns the theme that the app shows.
 */
export const getTheme = (): ThemeName => {
  const shown = document.documentElement.dataset.theme;
  return isThemeName(shown) ? shown : DEFAULT_THEME;
};

/**
 * Shows the app in the theme `theme`, keeps it for the next visits, and tells every listener. If the browser refuses
 * its store, the app shows `theme` until the page reloads.
 */
export const setTheme = (theme: ThemeName): void => {
  // A refused write still shows the theme on this page; only the next visits fall back to the default theme.
  localStorageBrowserStore.write(THEME_STORAGE_KEY, theme);
  applyTheme(theme);
  for (const listener of listeners) {
    listener();
  }
};

/**
 * Calls `listener` whenever the theme changes. Returns the function that stops the calls.
 */
export const subscribeTheme = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
