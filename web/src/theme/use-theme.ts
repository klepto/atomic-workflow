import { useSyncExternalStore } from 'react';
import { getTheme, subscribeTheme, type ThemeName } from '@/theme/theme.ts';

/**
 * Returns the theme that the app shows, and renders again when the theme changes.
 */
export const useTheme = (): ThemeName => useSyncExternalStore(subscribeTheme, getTheme);
