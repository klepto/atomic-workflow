import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog';
import { cn } from '@/lib/utils.ts';

/**
 * An alert dialog on the Base UI alert dialog primitive: the root that holds the open state. A click outside the
 * dialog does not close it.
 */
const AlertDialog = AlertDialogPrimitive.Root;

/**
 * The element that opens the dialog.
 */
const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

/**
 * The element that closes the dialog.
 */
const AlertDialogClose = AlertDialogPrimitive.Close;

/**
 * The dialog box in the middle of the window, above a backdrop that covers the whole window and dims it. Both fade in
 * and out, without the motion when the user asks for less.
 */
const AlertDialogContent = ({ className, ...props }: AlertDialogPrimitive.Popup.Props & { className?: string }) => (
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
 * The title of the dialog, which names it for assistive technology.
 */
const AlertDialogTitle = ({ className, ...props }: AlertDialogPrimitive.Title.Props & { className?: string }) => (
  <AlertDialogPrimitive.Title className={cn('font-semibold text-lg leading-7', className)} {...props} />
);

/**
 * The description of the dialog, which describes it for assistive technology.
 */
const AlertDialogDescription = ({
  className,
  ...props
}: AlertDialogPrimitive.Description.Props & { className?: string }) => (
  <AlertDialogPrimitive.Description className={cn('text-muted-foreground text-sm', className)} {...props} />
);

export {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
};
