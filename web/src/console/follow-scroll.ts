import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * The distance in pixels from the end of a scrolling box within which the box counts as scrolled to its end.
 */
const END_SLACK = 32;

/**
 * Returns whether `box` is scrolled to its end, give or take `END_SLACK`.
 */
const isAtEnd = (box: HTMLElement) => box.scrollHeight - box.scrollTop - box.clientHeight <= END_SLACK;

/**
 * Scrolls `box` to its end. The behavior `auto` leaves the animation to the CSS of the box, and `instant` jumps.
 */
const scrollToEnd = (box: HTMLElement, behavior: ScrollBehavior) => {
  box.scrollTo({ top: box.scrollHeight, behavior });
};

/**
 * A scrolling box that follows its end, and the calls that drive it.
 */
export interface FollowScroll {
  /**
   * The ref to set on the scrolling box.
   */
  box: RefObject<HTMLDivElement | null>;

  /**
   * Whether the box follows its end. It is false once the user scrolled up, until the box is at its end again.
   */
  following: boolean;

  /**
   * The handler of the event `scroll` of the box.
   */
  handleScroll: () => void;

  /**
   * Scrolls the box to its end and follows it again.
   */
  jumpToEnd: () => void;
}

/**
 * Returns a scrolling box that stays at its end when `content` changes or when the box or its first child changes
 * size, as long as it follows its end. The box follows its end from the start. It stops when the user scrolls up, and follows again once
 * it is at its end.
 */
export const useFollowScroll = (content: unknown): FollowScroll => {
  const box = useRef<HTMLDivElement>(null);
  const followingRef = useRef(true);
  const lastTop = useRef(0);
  const [following, setFollowing] = useState(true);

  /**
   * Sets whether the box follows its end.
   */
  const follow = useCallback((value: boolean) => {
    followingRef.current = value;
    setFollowing(value);
  }, []);

  const handleScroll = useCallback(() => {
    const element = box.current;
    if (element === null) {
      return;
    }
    // Only a move up stops the following, so that the scroll of an animated jump down does not.
    if (isAtEnd(element)) {
      follow(true);
    } else if (element.scrollTop < lastTop.current) {
      follow(false);
    }
    lastTop.current = element.scrollTop;
  }, [follow]);

  const jumpToEnd = useCallback(() => {
    follow(true);
    if (box.current !== null) {
      scrollToEnd(box.current, 'auto');
    }
  }, [follow]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the box scrolls each time the content changes.
  useLayoutEffect(() => {
    if (followingRef.current && box.current !== null) {
      scrollToEnd(box.current, 'instant');
      lastTop.current = box.current.scrollTop;
    }
  }, [content]);

  useEffect(() => {
    const element = box.current;
    const child = element?.firstElementChild;
    if (element === null || child === null || child === undefined || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(() => {
      if (followingRef.current) {
        scrollToEnd(element, 'instant');
        lastTop.current = element.scrollTop;
      }
    });
    observer.observe(element);
    observer.observe(child);
    return () => observer.disconnect();
  }, []);

  return { box, following, handleScroll, jumpToEnd };
};
