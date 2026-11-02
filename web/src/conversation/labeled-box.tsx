import type { ReactNode } from 'react';
import { cn } from '@/lib/utils.ts';

/**
 * Props of `LabeledBox`.
 */
interface LabeledBoxProps {
  /**
   * Label above the box, such as `bash command:`.
   */
  readonly label: string;

  /**
   * Content of the box.
   */
  readonly children: ReactNode;

  /**
   * Classes added to the box, which win over its own on a conflict, such as a maximum height.
   */
  readonly className?: string;
}

/**
 * Box of a piece of text that shows as typed, such as a shell command and its output: the small label `label` above a
 * bordered box that holds `children` in the monospace font, as preformatted text that wraps.
 */
export const LabeledBox = ({ label, children, className }: LabeledBoxProps) => (
  <div className="flex flex-col gap-1">
    <p className="text-[0.6875rem] text-muted-foreground leading-4">{label}</p>
    <pre
      className={cn(
        'whitespace-pre-wrap break-words rounded-md border bg-background px-3 py-2 font-mono text-xs leading-5',
        className,
      )}
    >
      {children}
    </pre>
  </div>
);
