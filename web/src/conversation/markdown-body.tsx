import type { ComponentProps } from 'react';
import Markdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { CodeBlock } from '@/conversation/code-block.tsx';
import { cn } from '@/lib/utils.ts';

/**
 * Props of `BodyLink`: the props of an `a` element, and the node of the Markdown tree that `react-markdown` passes.
 */
interface BodyLinkProps extends ComponentProps<'a'> {
  /**
   * Node of the Markdown tree of the element, which the element does not use.
   */
  readonly node?: unknown;
}

/**
 * Props of `MarkdownBody`.
 */
interface MarkdownBodyProps {
  /**
   * Text to render as Markdown.
   */
  readonly text: string;

  /**
   * Classes added to the box of the body, which win over its own on a conflict.
   */
  readonly className?: string;
}

/**
 * Link of a Markdown body. It opens in a new tab and hands over no reference to the page.
 */
const BodyLink = ({ node: _node, children, href, ...props }: BodyLinkProps) => (
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
 * Body that renders `text` as Markdown. Each line break in a paragraph is kept, as a terminal shows it, rather than
 * joined to a space. A fenced code block that names its language shows its code in colors. Raw HTML is not rendered,
 * and the default URL filter drops `javascript:` links. The classes of `className` are added to the box of the body,
 * and win over its own on a conflict.
 */
export const MarkdownBody = ({ text, className }: MarkdownBodyProps) => (
  <div
    className={cn(
      'flex flex-col gap-2 break-words text-sm [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_blockquote]:flex [&_blockquote]:flex-col [&_blockquote]:gap-2 [&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground/40 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_blockquote]:italic',
      className,
    )}
  >
    <Markdown remarkPlugins={[remarkBreaks]} components={{ a: BodyLink, code: CodeBlock }}>
      {text}
    </Markdown>
  </div>
);
