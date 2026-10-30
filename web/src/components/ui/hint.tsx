import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { cloneElement, createElement, type ReactElement, type ReactNode, useId } from 'react';
import { createPortal } from 'react-dom';

/**
 * Props of the button that a hint reads or sets.
 */
interface ButtonLikeProps {
  /**
   * Whether the button is disabled.
   */
  readonly disabled?: boolean;

  /**
   * Type of a native button, which submits its form while left out.
   */
  readonly type?: 'button' | 'submit' | 'reset';

  /**
   * Ids of the elements that describe the button, separated by spaces.
   */
  readonly 'aria-describedby'?: string;

  /**
   * Whether a Base UI button stays focusable while disabled.
   */
  readonly focusableWhenDisabled?: boolean;
}

/**
 * Props of `Hint`.
 */
interface HintProps {
  /**
   * What the button does, as a short imperative phrase in sentence case with no period, such as `Delete the task`.
   */
  readonly description: string;

  /**
   * Second line in muted text below the description, such as why the button is disabled or the message of its last
   * failed click. No second line shows while it is left out or empty.
   */
  readonly note?: string;

  /**
   * One button that the hint describes: a `Button` of `@/components/ui/button.tsx` or a native `button`.
   */
  readonly children: ReactElement<ButtonLikeProps>;
}

/**
 * Props of `HintProvider`.
 */
interface HintProviderProps {
  /**
   * Part of the app whose buttons have hints.
   */
  readonly children: ReactNode;
}

/**
 * Delay before a hint opens on hover, in ms.
 */
const HINT_DELAY = 250;

/**
 * Returns the button `button`, described by the ids `describedBy`, that stays focusable while disabled. A native
 * button becomes a Base UI button with the same props, and the same type, so a native button without one still
 * submits its form. Any other button, a Base UI button, takes `focusableWhenDisabled`.
 */
const focusableWhenDisabled = (button: ReactElement<ButtonLikeProps>, describedBy: string): ReactElement =>
  button.type === 'button'
    ? createElement(ButtonPrimitive, {
        ...button.props,
        type: button.props.type ?? 'submit',
        focusableWhenDisabled: true,
        'aria-describedby': describedBy,
      })
    : cloneElement(button, { focusableWhenDisabled: true, 'aria-describedby': describedBy });

/**
 * Provider of the hints of the buttons in `children`, mounted once around the app. It sets the delay before a hint
 * opens on hover, and opens the hint of the next button at once while another hint shows or just closed.
 */
export const HintProvider = ({ children }: HintProviderProps) => (
  <TooltipPrimitive.Provider delay={HINT_DELAY}>{children}</TooltipPrimitive.Provider>
);

/**
 * Hint of the button `children`: a small popup above it with `description`, and `note` in muted text below it
 * while `note` is not empty. It opens on hover after the delay of `HintProvider`, and at once on keyboard focus. It
 * closes on pointer leave, blur, Escape and click. The button keeps its own props, and gets the description and the
 * note as its `aria-describedby`, beside its own.
 *
 * A disabled button stays focusable and hoverable, so its hint still shows, and it still ignores clicks. It then has
 * `aria-disabled` and `data-disabled` in place of the `disabled` attribute, so its classes style it by `data-disabled`
 * or `aria-disabled`, not by `:disabled`.
 */
export const Hint = ({ description, note, children }: HintProps) => {
  const id = useId();
  const descriptionId = `${id}description`;
  const noteId = `${id}note`;
  const noted = note !== undefined && note !== '';
  const describedBy = [children.props['aria-describedby'], descriptionId, noted ? noteId : undefined]
    .filter((part) => part !== undefined && part !== '')
    .join(' ');
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger render={focusableWhenDisabled(children, describedBy)} />
      {createPortal(
        <div hidden>
          <span id={descriptionId}>{description}</span>
          {noted && <span id={noteId}>{note}</span>}
        </div>,
        document.body,
      )}
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner side="top" sideOffset={6} className="isolate z-50">
          <TooltipPrimitive.Popup
            data-slot="hint"
            className="flex max-w-xs origin-(--transform-origin) flex-col gap-0.5 rounded-md bg-popover px-2.5 py-1.5 text-popover-foreground text-xs shadow-md ring-1 ring-foreground/10 duration-100 data-closed:animate-out data-open:animate-in data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-instant:animate-none motion-reduce:animate-none"
          >
            <span>{description}</span>
            {noted && <span className="text-muted-foreground">{note}</span>}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
};
