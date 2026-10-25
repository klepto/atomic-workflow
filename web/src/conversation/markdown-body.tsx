import type { ComponentProps } from 'react';
import Markdown from 'react-markdown';
import { cn } from '@/lib/utils.ts';

/**
 * A link of a Markdown body: it opens in a new tab and hands over no reference to the page.
 */
const BodyLink = ({ node: _node, children, href, ...props }: ComponentProps<'a'> & { node?: unknown }) => (
  <a
    {...props}
    href={href || undefined}
    target="_blank"
    rel="noopener noreferrer"
    className="text-primary underline underline-offset-4"
  >
    {children}
  </a>
);

/**
 * Renders `text` as Markdown. Raw HTML is not rendered, and the default URL filter drops `javascript:` links. The
 * classes of `className` are added to the box of the body, and win over its own on a conflict.
 */
export const MarkdownBody = ({ text, className }: { text: string; className?: string }) => (
  <div
    className={cn(
      'flex flex-col gap-2 break-words text-sm [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2',
      className,
    )}
  >
    <Markdown components={{ a: BodyLink }}>{text}</Markdown>
  </div>
);
