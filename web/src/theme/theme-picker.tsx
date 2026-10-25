import { PaletteIcon } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.tsx';
import { THEMES, type ThemeName, setTheme, useTheme } from './theme.ts';

/**
 * The items of the picker: the name of each theme as its value and the name the app shows as its label.
 */
const ITEMS = THEMES.map((theme) => ({ value: theme.name, label: theme.label }));

/**
 * Shows the app in `theme`, the value the picker selected. A select without a value selects nothing, so `null`
 * changes nothing.
 */
const handleValueChange = (theme: ThemeName | null) => {
  if (theme !== null) {
    setTheme(theme);
  }
};

/**
 * The select by which the user picks the theme of the app. It shows the theme of the app and keeps the pick for the
 * next visits.
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
