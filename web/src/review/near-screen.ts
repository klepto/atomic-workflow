/**
 * Function that learns whether its element is near the screen: `true` once the element comes within the margin of the
 * box that scrolls, and `false` once it leaves it.
 */
type NearListener = (near: boolean) => void;

/**
 * Observer of the elements that one box that scrolls holds, with one margin, and the listener of each element.
 */
interface Watch {
  /**
   * Observer that reports when an element comes within the margin or leaves it.
   */
  readonly observer: IntersectionObserver;

  /**
   * Listener of each observed element.
   */
  readonly listeners: Map<Element, NearListener>;
}

/**
 * Selector of the box that scrolls of a `ScrollArea`.
 */
const SCROLL_VIEWPORT = '[data-slot="scroll-area-viewport"]';

/**
 * Observers by the box that scrolls, `null` for the window, then by margin. One observer serves every element of a
 * box and a margin, since a diff of many files has many chunks to observe.
 */
const watches = new Map<Element | null, Map<string, Watch>>();

/**
 * Returns the observer of the elements of the box `root` with the margin `margin`, and makes it when it is missing.
 */
const watchOf = (root: Element | null, margin: string): Watch => {
  const byMargin = watches.get(root) ?? new Map<string, Watch>();
  watches.set(root, byMargin);
  const known = byMargin.get(margin);
  if (known !== undefined) return known;
  const listeners = new Map<Element, NearListener>();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) listeners.get(entry.target)?.(entry.isIntersecting);
    },
    { root, rootMargin: margin },
  );
  const watch = { observer, listeners };
  byMargin.set(margin, watch);
  return watch;
};

/**
 * Calls `onChange` with `true` once the element `element` comes within the margin `margin` of the box that scrolls it,
 * and with `false` once it leaves the margin, starting with where it is now. The box is the `ScrollArea` that holds
 * the element, or the window when none does. The margin takes the syntax of `rootMargin` of an
 * `IntersectionObserver`, such as `150% 0px` for one and a half heights of the box above and below it. Returns the
 * function that ends the observation.
 */
export const observeNearScreen = (element: Element, margin: string, onChange: NearListener): (() => void) => {
  const root = element.closest(SCROLL_VIEWPORT);
  const watch = watchOf(root, margin);
  watch.listeners.set(element, onChange);
  watch.observer.observe(element);
  return () => {
    watch.observer.unobserve(element);
    watch.listeners.delete(element);
    if (watch.listeners.size > 0) return;
    watch.observer.disconnect();
    const byMargin = watches.get(root);
    byMargin?.delete(margin);
    if (byMargin?.size === 0) watches.delete(root);
  };
};
