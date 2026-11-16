import { type FocusEvent, type KeyboardEvent, type PointerEvent, type RefObject, useId, useMemo, useRef } from 'react';
import type { SharedHintHandle } from '@/components/ui/hint.tsx';

/**
 * Props that a line number button takes to show the hint that its body shares.
 */
export interface LineHintEvents {
  /**
   * Ids of the hidden description and note of the hint.
   */
  readonly 'aria-describedby': string;

  /**
   * Shows the hint above the button after the delay of a hint.
   */
  readonly onPointerEnter: (event: PointerEvent<HTMLElement>) => void;

  /**
   * Hides the hint.
   */
  readonly onPointerLeave: () => void;

  /**
   * Hides the hint on a press of the button.
   */
  readonly onPointerDown: () => void;

  /**
   * Shows the hint above the button at once on keyboard focus.
   */
  readonly onFocus: (event: FocusEvent<HTMLElement>) => void;

  /**
   * Hides the hint.
   */
  readonly onBlur: () => void;

  /**
   * Hides the hint on Escape.
   */
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

/**
 * Hint that the line numbers of one body share.
 */
export interface LineHint {
  /**
   * Prefix of the ids of the hidden description and note of the hint.
   */
  readonly id: string;

  /**
   * Handle of the `SharedHint` of the body.
   */
  readonly handle: RefObject<SharedHintHandle | null>;

  /**
   * Props of each line number button, the same object for the life of the body.
   */
  readonly events: LineHintEvents;
}

/**
 * Returns the hint that the line numbers of a body share: the id and the handle to give its `SharedHint`, and the
 * props of each line number button, which stay the same for the life of the body.
 */
export const useLineHint = (): LineHint => {
  const id = useId();
  const handle = useRef<SharedHintHandle>(null);
  const events = useMemo<LineHintEvents>(
    () => ({
      'aria-describedby': `${id}description ${id}note`,
      onPointerEnter: (event) => handle.current?.show(event.currentTarget, false),
      onPointerLeave: () => handle.current?.hide(),
      onPointerDown: () => handle.current?.hide(),
      onFocus: (event) => {
        if (event.currentTarget.matches(':focus-visible')) handle.current?.show(event.currentTarget, true);
      },
      onBlur: () => handle.current?.hide(),
      onKeyDown: (event) => {
        if (event.key === 'Escape') handle.current?.hide();
      },
    }),
    [id],
  );
  return { id, handle, events };
};
