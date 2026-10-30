import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils.ts';

/**
 * Returns the classes of an alert for its `variant`: `default` in the colors of a card, and `destructive` in the
 * color of danger.
 */
const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
  {
    variants: {
      variant: {
        default: 'bg-card text-card-foreground',
        destructive: 'bg-card text-destructive [&>svg]:text-current',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

/**
 * Props of `Alert`: the props of a `div`, and its variant as `alertVariants` takes it.
 */
interface AlertProps extends ComponentProps<'div'>, VariantProps<typeof alertVariants> {}

/**
 * Box with the role `alert` that draws attention to a message, styled by its `variant`, `default` while left out. An
 * icon as its first child stands in a column of its own, left of the text. Every other prop goes to its `div`, and
 * `className` adds classes.
 */
export const Alert = ({ className, variant, ...props }: AlertProps) => (
  <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
);

/**
 * Text of an alert, in muted color. Every prop goes to its `div`, and `className` adds classes.
 */
export const AlertDescription = ({ className, ...props }: ComponentProps<'div'>) => (
  <div
    data-slot="alert-description"
    className={cn('col-start-2 grid justify-items-start gap-1 text-muted-foreground text-sm', className)}
    {...props}
  />
);
