import { Columns2, Rows2 } from 'lucide-react';
import { Hint } from '@/components/ui/hint.tsx';
import { cn } from '@/lib/utils.ts';
import type { DiffLayout } from '@/review/use-diff-layout.ts';

/**
 * Props of `LayoutToggle`.
 */
interface LayoutToggleProps {
  /**
   * Layout that the diff shows.
   */
  readonly layout: DiffLayout;

  /**
   * Shows the diff in the layout `layout`.
   */
  readonly onChange: (layout: DiffLayout) => void;
}

/**
 * Buttons of the layouts, each with its label, its hint and its icon.
 */
const LAYOUTS = [
  { value: 'unified', label: 'Unified', description: 'Show the diff in one column', icon: Rows2 },
  { value: 'split', label: 'Split', description: 'Show the old and the new lines side by side', icon: Columns2 },
] as const;

/**
 * Two buttons that choose the layout `layout` of the diff, `Unified` and `Split`.
 */
export const LayoutToggle = ({ layout, onChange }: LayoutToggleProps) => (
  // biome-ignore lint/a11y/useSemanticElements: a fieldset would change the layout of the toggle and needs a legend.
  <div role="group" aria-label="Diff layout" className="flex rounded-md border bg-background p-0.5">
    {LAYOUTS.map(({ value, label, description, icon: Icon }) => (
      <Hint key={value} description={description}>
        <button
          type="button"
          aria-pressed={layout === value}
          onClick={() => onChange(value)}
          className={cn(
            'flex items-center gap-1.5 rounded-[calc(var(--radius)-4px)] px-2 py-1 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
            layout === value ? 'bg-secondary font-medium text-secondary-foreground' : 'text-muted-foreground',
          )}
        >
          <Icon aria-hidden="true" className="size-3.5" />
          {label}
        </button>
      </Hint>
    ))}
  </div>
);
