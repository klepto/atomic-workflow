import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils.ts';

/**
 * Classes of an alert, by variant.
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
 * A box that draws attention to a message.
 */
const Alert = ({ className, variant, ...props }: ComponentProps<'div'> & VariantProps<typeof alertVariants>) => (
  <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
);

/**
 * The title of an alert.
 */
const AlertTitle = ({ className, ...props }: ComponentProps<'div'>) => (
  <div data-slot="alert-title" className={cn('col-start-2 min-h-4 font-medium tracking-tight', className)} {...props} />
);

/**
 * The text of an alert.
 */
const AlertDescription = ({ className, ...props }: ComponentProps<'div'>) => (
  <div
    data-slot="alert-description"
    className={cn('col-start-2 grid justify-items-start gap-1 text-muted-foreground text-sm', className)}
    {...props}
  />
);

export { Alert, AlertDescription, AlertTitle };
