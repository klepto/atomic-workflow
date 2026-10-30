import { Select as SelectPrimitive } from '@base-ui/react/select';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils.ts';

/**
 * Props of `SelectTrigger`: the props of the Base UI trigger, and its height.
 */
interface SelectTriggerProps extends SelectPrimitive.Trigger.Props {
  /**
   * Height of the trigger: `sm` for 2rem, and `default` for 2.25rem. `default` while left out.
   */
  readonly size?: 'sm' | 'default';
}

/**
 * Props of `SelectContent`: the props of the Base UI popup, and the props of the Base UI positioner that place it.
 */
interface SelectContentProps
  extends SelectPrimitive.Popup.Props,
    Pick<SelectPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset' | 'alignItemWithTrigger'> {}

/**
 * Select on the Base UI select primitive: the root that holds the value and the open state, as its props `value` and
 * `onValueChange` set and follow them.
 */
export const Select = SelectPrimitive.Root;

/**
 * Text of the selected value, shown in the trigger. Every prop goes to the Base UI value, and `className` adds
 * classes.
 */
export const SelectValue = ({ className, ...props }: SelectPrimitive.Value.Props) => (
  <SelectPrimitive.Value data-slot="select-value" className={cn('flex flex-1 text-left', className)} {...props} />
);

/**
 * Button that opens the list of a select, with its content `children` and a chevron at its right end. It is `sm` or
 * `default` high, by `size`. Every other prop goes to the Base UI trigger, and `className` adds classes.
 */
export const SelectTrigger = ({ className, size = 'default', children, ...props }: SelectTriggerProps) => (
  <SelectPrimitive.Trigger
    data-slot="select-trigger"
    data-size={size}
    className={cn(
      "flex w-fit items-center justify-between gap-1.5 whitespace-nowrap rounded-md border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8 data-placeholder:text-muted-foreground *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon className="flex">
      <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
);

/**
 * Popup with the items `children` of a select, placed next to the trigger on the side `side`, `bottom` while left out,
 * at the distance `sideOffset` in px, 4 while left out, and aligned by `align` and `alignOffset`, `center` and 0 while
 * left out. While `alignItemWithTrigger` is true, as it is while left out, the selected item lies over the trigger
 * instead. Every other prop goes to the Base UI popup, and `className` adds classes.
 */
export const SelectContent = ({
  className,
  children,
  side = 'bottom',
  sideOffset = 4,
  align = 'center',
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...props
}: SelectContentProps) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Positioner
      side={side}
      sideOffset={sideOffset}
      align={align}
      alignOffset={alignOffset}
      alignItemWithTrigger={alignItemWithTrigger}
      className="isolate z-50"
    >
      <SelectPrimitive.Popup
        data-slot="select-content"
        data-align-trigger={alignItemWithTrigger}
        className={cn(
          'relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-y-auto overflow-x-hidden rounded-md bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[align-trigger=true]:animate-none data-closed:animate-out data-open:animate-in data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.List>{children}</SelectPrimitive.List>
      </SelectPrimitive.Popup>
    </SelectPrimitive.Positioner>
  </SelectPrimitive.Portal>
);

/**
 * Item of a select with the content `children`, with a check mark while it is selected. Its prop `value` is the value
 * that it selects. Every other prop goes to the Base UI item, and `className` adds classes.
 */
export const SelectItem = ({ className, children, ...props }: SelectPrimitive.Item.Props) => (
  <SelectPrimitive.Item
    data-slot="select-item"
    className={cn(
      "relative flex w-full cursor-default select-none items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
      className,
    )}
    {...props}
  >
    <SelectPrimitive.ItemText className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">
      {children}
    </SelectPrimitive.ItemText>
    <SelectPrimitive.ItemIndicator
      render={<span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />}
    >
      <CheckIcon className="pointer-events-none" />
    </SelectPrimitive.ItemIndicator>
  </SelectPrimitive.Item>
);
