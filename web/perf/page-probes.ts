/**
 * State of the probe that `installProbe` puts in the page, which tells when the page settled.
 */
interface ProbeState {
  /**
   * Time of the latest change of the DOM, or of the latest time that the main thread was busy, in ms since the start
   * of the page.
   */
  quietSince: number;

  /**
   * Time of the latest idle callback, in ms since the start of the page.
   */
  lastIdle: number;
}

declare global {
  interface Window {
    /**
     * Probe of the performance check, which `installProbe` sets. Only the pages of the check have it.
     */
    perfProbe?: ProbeState;

    /**
     * Delay of the latest click that `armClick` waits for, in ms. Only the pages of the check have it.
     */
    perfClick?: Promise<number>;
  }
}

// Each function below runs in the page, through `addInitScript` or `evaluate` of Playwright, which sends its source
// alone. So each one uses only its parameters and the globals of the page, never a declaration of this module.

/**
 * Puts the probe `window.perfProbe` in the page, before any script of the page runs. It moves `quietSince` to the time
 * of each change of the DOM, and to the end of each gap between two idle callbacks longer than 100 ms. A busy main
 * thread runs no idle callback, and React keeps it busy while it renders in slices without a change of the DOM. Runs
 * in the page.
 */
export const installProbe = (): void => {
  // Longest gap between two idle callbacks of an idle main thread, in ms.
  const idleGap = 100;
  const state: ProbeState = { quietSince: performance.now(), lastIdle: performance.now() };
  window.perfProbe = state;
  new MutationObserver(() => {
    state.quietSince = performance.now();
  }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  const idle = (): void => {
    const now = performance.now();
    if (now - state.lastIdle > idleGap) state.quietSince = now;
    state.lastIdle = now;
    requestIdleCallback(idle);
  };
  requestIdleCallback(idle);
};

/**
 * Returns for how long the page has been quiet, in ms: no change of its DOM, and a main thread that stayed idle. While
 * the main thread is busy, or the probe is missing, returns 0. Runs in the page.
 */
export const quietSpan = (): number => {
  // Longest gap between two idle callbacks of an idle main thread, in ms, as in `installProbe`.
  const idleGap = 100;
  const state = window.perfProbe;
  const now = performance.now();
  if (state === undefined || now - state.lastIdle > idleGap) return 0;
  return now - state.quietSince;
};

/**
 * Sets `window.perfClick` to the delay of the next click in the page: the time from the click event to the paint that
 * follows the opening of the comment composer, its `textarea`, in ms. Runs in the page.
 */
export const armClick = (): void => {
  window.perfClick = new Promise((resolve) => {
    let clickedAt: number | undefined;
    const handleClick = (event: MouseEvent): void => {
      clickedAt = event.timeStamp;
      window.removeEventListener('click', handleClick, true);
    };
    window.addEventListener('click', handleClick, true);
    const observer = new MutationObserver((records) => {
      if (clickedAt === undefined) return;
      const opened = records.some((record) =>
        [...record.addedNodes].some(
          (node) => node instanceof Element && (node.matches('textarea') || node.querySelector('textarea') !== null),
        ),
      );
      if (!opened) return;
      observer.disconnect();
      const start = clickedAt;
      // The frame that shows the change paints after its animation frame callbacks, and a task after them runs once
      // it painted.
      requestAnimationFrame(() => setTimeout(() => resolve(performance.now() - start), 0));
    });
    observer.observe(document, { subtree: true, childList: true });
  });
};

/**
 * Returns the delay of the click that `armClick` waits for, in ms, once it painted. Rejects when `armClick` did not
 * run. Runs in the page.
 */
export const readClickDelay = async (): Promise<number> => {
  if (window.perfClick === undefined) throw new Error('The click probe is not armed');
  return window.perfClick;
};

/**
 * Scrolls the scroll area of the review from its top to its bottom at `speed` px/s, and returns the length of each
 * frame meanwhile, in ms. Rejects when the page has no review. Runs in the page.
 */
export const scrollWhole = async (speed: number): Promise<readonly number[]> =>
  new Promise((resolve, reject) => {
    const viewport = document.getElementById('review-file-0')?.closest('[data-slot="scroll-area-viewport"]');
    if (!(viewport instanceof HTMLElement)) {
      reject(new Error('The scroll area of the review is missing'));
      return;
    }
    viewport.scrollTop = 0;
    const frames: number[] = [];
    let start: number | undefined;
    let last = 0;
    const step = (now: number): void => {
      if (start === undefined) start = now;
      else frames.push(now - last);
      last = now;
      const end = viewport.scrollHeight - viewport.clientHeight;
      const top = Math.min(end, ((now - start) * speed) / 1000);
      viewport.scrollTop = top;
      if (top >= end) resolve(frames);
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
