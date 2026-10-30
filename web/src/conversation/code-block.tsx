import { type ComponentProps, Fragment } from 'react';
import type { ThemedToken } from 'shiki/core';
import { highlighterOf, languageOfFence, MAX_HIGHLIGHT_LINES, tokenStyle } from '@/lib/code-highlight.ts';
import { useHighlight } from '@/lib/use-highlight.ts';

/**
 * Colored pieces of each line of a code block, one array per line.
 */
type BlockColors = readonly (readonly ThemedToken[])[];

/**
 * Props of `CodeBlock`: the props of a `code` element, and the node of the Markdown tree that `react-markdown` passes.
 */
interface CodeBlockProps extends ComponentProps<'code'> {
  /**
   * Node of the Markdown tree of the element, which the element does not use.
   */
  readonly node?: unknown;
}

/**
 * Colors of each code block that was colored once, by the key of `blockKey`, so that a block that shows again does
 * not color again.
 */
const blockColors = new Map<string, BlockColors>();

/**
 * Returns the name of the language of a fenced code block from the classes `className` of its `code` element, such as
 * `ts` for `language-ts`. If no class names a language, such as for inline code, returns `undefined` instead.
 */
const fenceLanguageOf = (className: string | undefined): string | undefined =>
  className?.match(/(?:^|\s)language-(\S+)/)?.[1];

/**
 * Returns the key of the code `code` in the language `language` in `blockColors`: the language, or an empty string
 * without one, a line break, then the code. A language holds no whitespace, so the first line break ends it.
 */
const blockKey = (language: string | undefined, code: string): string => `${language ?? ''}\n${code}`;

/**
 * Colors the code block of the key `key` of `blockKey`. Resolves to the colors of its code, and rejects when the
 * highlighter fails to load. If its language gets no colors, or its code has more than `MAX_HIGHLIGHT_LINES` lines,
 * returns `undefined` instead.
 */
const colorBlock = (key: string): Promise<BlockColors> | undefined => {
  const end = key.indexOf('\n');
  const language = key.slice(0, end);
  const code = key.slice(end + 1);
  const loadLanguage = language === '' ? undefined : languageOfFence(language);
  if (loadLanguage === undefined || code.split('\n').length > MAX_HIGHLIGHT_LINES) return undefined;
  return highlighterOf(loadLanguage).then((highlighter) => highlighter.tokenize(code));
};

/**
 * `code` element of a Markdown body. The code of a fenced block that names a language that gets colors shows in those
 * colors once they load, and without colors before. Inline code, and a block in any other language, shows without
 * colors.
 */
export const CodeBlock = ({ node: _node, className, children, ...props }: CodeBlockProps) => {
  const language = fenceLanguageOf(className);
  // A fenced block ends with the line break before its closing fence, which is no line of its code.
  const code = typeof children === 'string' ? children.replace(/\n$/, '') : '';
  const colors = useHighlight(blockKey(language, code), blockColors, colorBlock);
  return (
    <code {...props} className={className}>
      {colors === undefined
        ? children
        : colors.map((tokens, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the lines of a block keep their order.
            <Fragment key={index}>
              {index > 0 && '\n'}
              {tokens.map((token) => (
                <span key={token.offset} style={tokenStyle(token)}>
                  {token.content}
                </span>
              ))}
            </Fragment>
          ))}
    </code>
  );
};
