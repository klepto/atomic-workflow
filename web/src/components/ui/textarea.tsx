import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils.ts';

/**
 * Text field of several lines, which grows with its content from a height of 4rem. Every prop goes to its `textarea`,
 * and `className` adds classes.
 */
export const Textarea = ({ className, ...props }: ComponentProps<'textarea'>) => (
  <textarea
    data-slot="textarea"
    className={cn(
      'flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
      className,
    )}
    {...props}
  />
);
