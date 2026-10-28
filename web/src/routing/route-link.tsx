import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { navigate } from '@/routing/navigation.ts';

/**
 * Props of a `RouteLink`: the path `to` that it leads to, and every other prop of an anchor.
 */
export type RouteLinkProps = { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>;

/**
 * Returns whether the click `event` is a plain primary click, with no Ctrl, Meta, Shift or Alt, which the app handles
 * in place. Any other click, such as one that opens the link in a new tab, is left to the browser.
 */
export const isPlainClick = (event: MouseEvent<HTMLAnchorElement>): boolean =>
  event.button === 0 && !(event.ctrlKey || event.metaKey || event.shiftKey || event.altKey);

/**
 * An `<a href={to}>` with every other prop of an anchor. A plain primary click, with no Ctrl, Meta, Shift or Alt,
 * calls `navigate(to)` in place of a page load. Any other click does what the browser does, as does a click whose
 * `onClick` prevents the default, or on a link with a `target` other than `_self`.
 */
export const RouteLink = ({ to, onClick, ...props }: RouteLinkProps) => (
  <a
    {...props}
    href={to}
    onClick={(event) => {
      onClick?.(event);
      if (!event.defaultPrevented && isPlainClick(event) && (props.target === undefined || props.target === '_self')) {
        event.preventDefault();
        navigate(to);
      }
    }}
  />
);
