import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils.ts';

/**
 * Returns the classes of a button for its `variant`, its `size` and its own `className`. The variant `default` fills
 * the button with the primary color, `destructive` with the color of danger, `outline` draws a border, `secondary`
 * fills it with a muted color, `ghost` shows only its content, and `link` looks like a link. The size `default` is
 * 2.25rem high, `sm` 2rem, `lg` 2.5rem, and `icon` is a square of 2.25rem.
 */
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-sm outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        destructive: 'bg-destructive text-white shadow-xs hover:bg-destructive/90',
        outline: 'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 gap-1.5 rounded-md px-3',
        lg: 'h-10 rounded-md px-6',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

/**
 * Props of `Button`: the props of the Base UI button, its variant and its size as `buttonVariants` takes them, and its
 * classes.
 */
interface ButtonProps
  extends Omit<ComponentProps<typeof ButtonPrimitive>, 'className'>,
    VariantProps<typeof buttonVariants> {
  /**
   * Classes of the button, which win over the classes of its variant and its size.
   */
  readonly className?: string;
}

/**
 * Button on the Base UI button primitive, styled by its `variant` and its `size`, `default` for both while left out.
 * Every other prop goes to the primitive.
 */
export const Button = ({ className, variant, size, ...props }: ButtonProps) => (
  <ButtonPrimitive data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
);
