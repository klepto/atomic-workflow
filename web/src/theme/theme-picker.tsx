import { PaletteIcon } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.tsx';
import { setTheme, THEMES, type ThemeName } from '@/theme/theme.ts';
import { useTheme } from '@/theme/use-theme.ts';

/**
 * Items of the picker: the name of each theme as its value, and the name that the app shows as its label.
 */
const ITEMS = THEMES.map((theme) => ({ value: theme.name, label: theme.label }));

/**
 * Shows the app in the theme `theme`, the value that the picker selected. A select without a value selects nothing,
 * so `null` changes nothing.
 */
const handleValueChange = (theme: ThemeName | null): void => {
  if (theme !== null) setTheme(theme);
};

/**
 * Select by which the user picks the theme of the app. It shows the theme of the app, and keeps the pick for the next
 * visits.
 */
export const ThemePicker = () => {
  const theme = useTheme();
  return (
    <Select items={ITEMS} value={theme} onValueChange={handleValueChange}>
      <SelectTrigger size="sm" aria-label="Theme">
        <PaletteIcon aria-hidden="true" className="text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ITEMS.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
