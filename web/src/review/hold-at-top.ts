/**
 * Time without a scroll after which a scroll counts as ended, in ms.
 */
const SCROLL_END_DELAY = 150;

/**
 * Time without a change of the height of the content after which the hold ends, once the scroll ended, in ms.
 */
const SETTLE_DELAY = 1000;

/**
 * Events of the reviewer anywhere in the page that end the hold, since they scroll or act on the page, such as a drag
 * of the scrollbar.
 */
const INPUT_EVENTS = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;

/**
 * Scrolls the box `viewport` so that the element `element` starts at its top, smoothly with `smooth`, and keeps it
 * there while the content above it changes its height, such as while the chunks of lines above it render. The hold
 * ends once the content keeps its height for `SETTLE_DELAY` after the scroll, at once when the reviewer acts on the
 * page, and when anything else scrolls the element away from the top after the scroll. Returns the function that ends
 * the hold early.
 */
export const holdAtTop = (element: HTMLElement, viewport: HTMLElement, smooth: boolean): (() => void) => {
  let scrolling = true;
  let scrollEnd: ReturnType<typeof setTimeout> | undefined;
  let settle: ReturnType<typeof setTimeout> | undefined;

  /**
   * Ends the hold.
   */
  const stop = (): void => {
    clearTimeout(scrollEnd);
    clearTimeout(settle);
    resizeObserver.disconnect();
    viewport.removeEventListener('scroll', onScroll);
    for (const type of INPUT_EVENTS) document.removeEventListener(type, stop, { capture: true });
  };

  /**
   * Ends the hold once the content keeps its height for `SETTLE_DELAY`.
   */
  const waitToSettle = (): void => {
    clearTimeout(settle);
    settle = setTimeout(stop, SETTLE_DELAY);
  };

  /**
   * Returns how far the element starts below the top of the box, in px.
   */
  const offsetOf = (): number => element.getBoundingClientRect().top - viewport.getBoundingClientRect().top;

  /**
   * Moves the element back to the top of the box, at once.
   */
  const correct = (): void => {
    const offset = offsetOf();
    if (Math.abs(offset) >= 1) viewport.scrollTop += offset;
  };

  /**
   * Counts the scroll as ended once no scroll follows for `SCROLL_END_DELAY`. After it, a scroll that moves the element
   * away from the top comes from elsewhere, such as a script or the end of the content, and ends the hold.
   */
  const onScroll = (): void => {
    if (!scrolling) {
      if (Math.abs(offsetOf()) >= 1) stop();
      return;
    }
    clearTimeout(scrollEnd);
    scrollEnd = setTimeout(() => {
      if (!scrolling) return;
      scrolling = false;
      correct();
      waitToSettle();
    }, SCROLL_END_DELAY);
  };

  const resizeObserver = new ResizeObserver(() => {
    if (scrolling) {
      // A smooth scroll aims at where the element was when it started, so it aims again at where the element is now.
      element.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
      return;
    }
    correct();
    waitToSettle();
  });

  element.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
  viewport.addEventListener('scroll', onScroll, { passive: true });
  for (const type of INPUT_EVENTS) document.addEventListener(type, stop, { capture: true, passive: true });
  const content = viewport.firstElementChild;
  if (content !== null) resizeObserver.observe(content);
  onScroll();
  return stop;
};
