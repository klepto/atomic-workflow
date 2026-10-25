import { useSyncExternalStore } from 'react';

/**
 * Name of a theme of the app. The attribute `data-theme` of the root element holds it.
 */
export type ThemeName = 'zen' | 'claude';

/**
 * A theme that the user can pick.
 */
export interface Theme {
  /**
   * The name of the theme.
   */
  name: ThemeName;

  /**
   * The name of the theme that the app shows.
   */
  label: string;
}

/**
 * The themes that the user can pick, the default first.
 */
export const THEMES: readonly Theme[] = [
  { name: 'zen', label: 'Default' },
  { name: 'claude', label: 'Claude' },
];

/**
 * The theme of the app while the user picked none.
 */
export const DEFAULT_THEME: ThemeName = 'zen';

/**
 * The key of the local storage entry that holds the theme the user picked.
 */
export const THEME_STORAGE_KEY = 'atomic-workflow.theme';

/**
 * The functions to call when the theme changes.
 */
const listeners = new Set<() => void>();

/**
 * Returns whether `value` is the name of a theme.
 */
const isThemeName = (value: unknown): value is ThemeName => THEMES.some((theme) => theme.name === value);

/**
 * Returns the theme that the user picked. If the user picked none, or the browser refuses the local storage, returns
 * the default theme instead.
 */
const readStoredTheme = (): ThemeName => {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeName(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
};

/**
 * Shows the app in the dark variant of `theme`.
 */
const applyTheme = (theme: ThemeName) => {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.add('dark');
};

/**
 * Shows the app in the theme that the user picked, or in the default theme if the user picked none.
 */
export const applyStoredTheme = () => applyTheme(readStoredTheme());

/**
 * Returns the theme that the app shows.
 */
export const getTheme = (): ThemeName => {
  const shown = document.documentElement.dataset.theme;
  return isThemeName(shown) ? shown : DEFAULT_THEME;
};

/**
 * Shows the app in `theme`, keeps `theme` for the next visits and tells every listener. If the browser refuses the
 * local storage, the app shows `theme` until the page reloads.
 */
export const setTheme = (theme: ThemeName) => {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The theme still applies to this page; only the next visits fall back to the default theme.
  }
  applyTheme(theme);
  for (const listener of listeners) {
    listener();
  }
};

/**
 * Calls `listener` whenever the theme changes. Returns the function that stops the calls.
 */
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Returns the theme that the app shows, and renders again when the theme changes.
 */
export const useTheme = () => useSyncExternalStore(subscribe, getTheme);
