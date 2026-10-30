import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog';
import { cn } from '@/lib/utils.ts';

/**
 * Props of `AlertDialogContent`: the props of the Base UI popup of the dialog, and its classes.
 */
interface AlertDialogContentProps extends AlertDialogPrimitive.Popup.Props {
  /**
   * Classes of the dialog box, beside its own.
   */
  readonly className?: string;
}

/**
 * Props of `AlertDialogTitle`: the props of the Base UI title of the dialog, and its classes.
 */
interface AlertDialogTitleProps extends AlertDialogPrimitive.Title.Props {
  /**
   * Classes of the title, beside its own.
   */
  readonly className?: string;
}

/**
 * Props of `AlertDialogDescription`: the props of the Base UI description of the dialog, and its classes.
 */
interface AlertDialogDescriptionProps extends AlertDialogPrimitive.Description.Props {
  /**
   * Classes of the description, beside its own.
   */
  readonly className?: string;
}

/**
 * Alert dialog on the Base UI alert dialog primitive: the root that holds the open state, as its props `open` and
 * `onOpenChange` set and follow it. A click outside the dialog does not close it.
 */
export const AlertDialog = AlertDialogPrimitive.Root;

/**
 * Element that opens the dialog. Its prop `render` names the element to render, such as a `Button`.
 */
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

/**
 * Element that closes the dialog. Its prop `render` names the element to render, such as a `Button`.
 */
export const AlertDialogClose = AlertDialogPrimitive.Close;

/**
 * Dialog box in the middle of the window, above a backdrop that covers the whole window and dims it. Both fade in and
 * out, without the motion when the user asks for less. Every prop goes to the popup, and `className` adds classes.
 */
export const AlertDialogContent = ({ className, ...props }: AlertDialogContentProps) => (
  <AlertDialogPrimitive.Portal>
    <AlertDialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/50 duration-150 data-closed:animate-out data-open:animate-in data-closed:fade-out-0 data-open:fade-in-0 motion-reduce:animate-none" />
    <AlertDialogPrimitive.Popup
      data-slot="alert-dialog-content"
      className={cn(
        'fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border bg-background p-6 shadow-lg outline-none duration-150 data-closed:animate-out data-open:animate-in data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  </AlertDialogPrimitive.Portal>
);

/**
 * Title of the dialog, which names it for assistive technology. Every prop goes to the Base UI title, and `className`
 * adds classes.
 */
export const AlertDialogTitle = ({ className, ...props }: AlertDialogTitleProps) => (
  <AlertDialogPrimitive.Title className={cn('font-semibold text-lg leading-7', className)} {...props} />
);

/**
 * Description of the dialog, which describes it for assistive technology. Every prop goes to the Base UI description,
 * and `className` adds classes.
 */
export const AlertDialogDescription = ({ className, ...props }: AlertDialogDescriptionProps) => (
  <AlertDialogPrimitive.Description className={cn('text-muted-foreground text-sm', className)} {...props} />
);
