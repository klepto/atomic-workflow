import { type ComponentProps, Fragment, useEffect, useState } from 'react';
import type { ThemedToken } from 'shiki/core';
import { highlighterOf, languageOfFence, tokenStyle } from '@/lib/code-highlight.ts';

/**
 * The colored pieces of each line of a code block, one array per line.
 */
type BlockColors = readonly (readonly ThemedToken[])[];

/**
 * The most lines of a code block that get colors. A larger block shows its code without colors, so that it does not
 * hold up the page.
 */
const MAX_LINES = 5000;

/**
 * The colors of each code block that was colored once, by its language and its code, so that a block that shows again
 * does not color again.
 */
const blockColors = new Map<string, BlockColors>();

/**
 * Returns the name of the language of a fenced code block from the classes `className` of its `code` element, such as
 * `ts` for `language-ts`. If no class names a language, such as for inline code, returns `undefined` instead.
 */
const fenceLanguageOf = (className: string | undefined): string | undefined =>
  className?.match(/(?:^|\s)language-(\S+)/)?.[1];

/**
 * Returns the colors of the code `code` in the language `language`, or `undefined` while they load. If the language
 * gets no colors, the code is too large, or the colors fail to load, returns `undefined` for good.
 */
const useBlockColors = (language: string | undefined, code: string): BlockColors | undefined => {
  const key = `${language}\n${code}`;
  const [colors, setColors] = useState(() => blockColors.get(key));

  useEffect(() => {
    const known = blockColors.get(key);
    setColors(known);
    const loadLanguage = language === undefined ? undefined : languageOfFence(language);
    if (known !== undefined || loadLanguage === undefined) return;
    if (code.split('\n').length > MAX_LINES) return;
    let current = true;
    highlighterOf(loadLanguage).then(
      (highlighter) => {
        const loaded = highlighter.tokenize(code);
        blockColors.set(key, loaded);
        if (current) setColors(loaded);
      },
      (error: unknown) => console.error(`Failed to color a code block in ${language}.`, error),
    );
    return () => {
      current = false;
    };
  }, [key, language, code]);

  return colors;
};

/**
 * The `code` element of a Markdown body. The code of a fenced block that names a language that gets colors shows in
 * those colors once they load, and without colors before. Inline code, and a block in any other language, shows
 * without colors.
 */
export const CodeBlock = ({
  node: _node,
  className,
  children,
  ...props
}: ComponentProps<'code'> & { node?: unknown }) => {
  const language = fenceLanguageOf(className);
  // A fenced block ends with the line break before its closing fence, which is no line of its code.
  const code = typeof children === 'string' ? children.replace(/\n$/, '') : '';
  const colors = useBlockColors(language, code);
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
