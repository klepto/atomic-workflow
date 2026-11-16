import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import {
  cloneElement,
  createElement,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils.ts';

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
 * Props of `OverflowHint`.
 */
interface OverflowHintProps {
  /**
   * Full text that the hint shows.
   */
  readonly text: string;

  /**
   * Element that shows `text` on one line, and cuts it off while it does not fit.
   */
  readonly target: RefObject<HTMLElement | null>;

  /**
   * One element that opens the hint on hover and on keyboard focus, such as a link that holds `target`.
   */
  readonly children: ReactElement;
}

/**
 * Functions that show and hide a `SharedHint`.
 */
export interface SharedHintHandle {
  /**
   * Shows the hint above the element `target`: at once with `immediate` or while a hint shows or just closed, else
   * after the delay of a hint.
   */
  readonly show: (target: Element, immediate: boolean) => void;

  /**
   * Hides the hint.
   */
  readonly hide: () => void;
}

/**
 * Props of `SharedHint`.
 */
interface SharedHintProps {
  /**
   * Prefix of the ids of the hidden description and note, which the buttons name in their `aria-describedby`:
   * `<id>description` and `<id>note`.
   */
  readonly id: string;

  /**
   * What each button does, as `Hint` says.
   */
  readonly description: string;

  /**
   * Second line in muted text below the description, as `Hint` says.
   */
  readonly note?: string;

  /**
   * Handle that the buttons call to show and hide the hint.
   */
  readonly handle: Ref<SharedHintHandle>;
}

/**
 * Delay before a hint opens on hover, in ms.
 */
const HINT_DELAY = 250;

/**
 * Time after a hint closes during which the next one opens at once, in ms, as the default of Base UI.
 */
const HINT_WARM = 400;

/**
 * Classes of the popup of every hint.
 */
const HINT_POPUP =
  'flex max-w-xs origin-(--transform-origin) flex-col gap-0.5 rounded-md bg-popover px-2.5 py-1.5 text-popover-foreground text-xs shadow-md ring-1 ring-foreground/10 duration-100 data-closed:animate-out data-open:animate-in data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-instant:animate-none motion-reduce:animate-none';

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
          <TooltipPrimitive.Popup data-slot="hint" className={HINT_POPUP}>
            <span>{description}</span>
            {noted && <span className="text-muted-foreground">{note}</span>}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
};

/**
 * One hint for many buttons, such as the line numbers of a diff, so that each button costs no tooltip of its own: a
 * popup in the style of `Hint` above the button that `handle` last showed it for. It renders hidden copies of
 * `description` and `note` with ids from `id`, which each button names in its `aria-describedby`. The buttons call
 * `show` on hover and on keyboard focus, and `hide` on pointer leave, blur, Escape and click.
 */
export const SharedHint = ({ id, description, note, handle }: SharedHintProps) => {
  const [target, setTarget] = useState<Element | null>(null);
  const [open, setOpen] = useState(false);
  const shown = useRef(false);
  const delay = useRef<ReturnType<typeof setTimeout>>(undefined);
  const warm = useRef<ReturnType<typeof setTimeout>>(undefined);
  const noted = note !== undefined && note !== '';

  useImperativeHandle(
    handle,
    () => ({
      show: (element, immediate) => {
        clearTimeout(delay.current);
        setTarget(element);
        if (immediate || shown.current || warm.current !== undefined) {
          shown.current = true;
          setOpen(true);
          return;
        }
        delay.current = setTimeout(() => {
          shown.current = true;
          setOpen(true);
        }, HINT_DELAY);
      },
      hide: () => {
        clearTimeout(delay.current);
        if (shown.current) {
          clearTimeout(warm.current);
          warm.current = setTimeout(() => {
            warm.current = undefined;
          }, HINT_WARM);
        }
        shown.current = false;
        setOpen(false);
      },
    }),
    [],
  );

  useEffect(
    () => () => {
      clearTimeout(delay.current);
      clearTimeout(warm.current);
    },
    [],
  );

  return (
    <>
      <div hidden>
        <span id={`${id}description`}>{description}</span>
        {noted && <span id={`${id}note`}>{note}</span>}
      </div>
      {target !== null && (
        <TooltipPrimitive.Root
          open={open}
          onOpenChange={(next) => {
            if (!next) {
              shown.current = false;
              setOpen(false);
            }
          }}
        >
          <TooltipPrimitive.Portal>
            <TooltipPrimitive.Positioner anchor={target} side="top" sideOffset={6} className="isolate z-50">
              <TooltipPrimitive.Popup data-slot="hint" className={HINT_POPUP}>
                <span>{description}</span>
                {noted && <span className="text-muted-foreground">{note}</span>}
              </TooltipPrimitive.Popup>
            </TooltipPrimitive.Positioner>
          </TooltipPrimitive.Portal>
        </TooltipPrimitive.Root>
      )}
    </>
  );
};

/**
 * Returns whether the element `element` cuts off its text, since the text is wider than the element.
 */
const overflows = (element: HTMLElement | null): boolean =>
  element !== null && element.scrollWidth > element.clientWidth;

/**
 * Hint of the element `children` that shows the full text `text` of the element `target` while `target` cuts it off:
 * a small popup in the style of `Hint`, to the right of the cursor, which it follows, so it never covers the elements
 * above or below `children`. On keyboard focus, it shows to the right of `children`. It opens at once on hover, with
 * no delay, and on keyboard focus, but only while `target` cuts off its text. It closes on pointer leave, blur, Escape
 * and click.
 * The element keeps its own props, and a screen reader hears nothing more, since `target` holds the full text.
 */
export const OverflowHint = ({ text, target, children }: OverflowHintProps) => {
  const [open, setOpen] = useState(false);
  return (
    <TooltipPrimitive.Root
      open={open}
      onOpenChange={(next) => setOpen(next && overflows(target.current))}
      trackCursorAxis="both"
      disableHoverablePopup
    >
      <TooltipPrimitive.Trigger delay={0} render={children} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner side="right" sideOffset={16} className="isolate z-50">
          <TooltipPrimitive.Popup data-slot="hint" className={cn(HINT_POPUP, 'break-words')}>
            {text}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
};
