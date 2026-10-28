import { useEffect, useState } from 'react';
import type { HighlighterCore, LanguageRegistration, ThemedToken } from 'shiki/core';
import type { DiffHunk, DiffLine, FileDiff } from '@/review/patch.ts';

/**
 * The colored pieces of the text of each line of a file, by the line of the diff that holds the text. A line without
 * an entry shows its text without colors.
 */
export type FileHighlight = ReadonlyMap<DiffLine, readonly ThemedToken[]>;

/**
 * Loads the grammar of a language, after the grammars of the languages that it embeds.
 */
type LanguageLoader = () => Promise<{ default: LanguageRegistration[] }>;

/**
 * The most lines of a file that get colors. A larger file shows its text without colors, so that it does not hold up
 * the page.
 */
const MAX_LINES = 5000;

/**
 * The longest line that gets colors. A longer line, such as one of minified code, shows its text in one color.
 */
const MAX_LINE_LENGTH = 1000;

/**
 * The languages that get colors, by the extension of a file, or by its whole name for a file without one. Only these
 * grammars ship with the app, each loaded on the first file that needs it.
 */
const LANGUAGES: Readonly<Record<string, LanguageLoader>> = {
  ts: () => import('shiki/langs/typescript.mjs'),
  mts: () => import('shiki/langs/typescript.mjs'),
  cts: () => import('shiki/langs/typescript.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  js: () => import('shiki/langs/javascript.mjs'),
  mjs: () => import('shiki/langs/javascript.mjs'),
  cjs: () => import('shiki/langs/javascript.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  jsonc: () => import('shiki/langs/jsonc.mjs'),
  md: () => import('shiki/langs/markdown.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  scss: () => import('shiki/langs/scss.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  htm: () => import('shiki/langs/html.mjs'),
  xml: () => import('shiki/langs/xml.mjs'),
  svg: () => import('shiki/langs/xml.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  yml: () => import('shiki/langs/yaml.mjs'),
  toml: () => import('shiki/langs/toml.mjs'),
  ini: () => import('shiki/langs/ini.mjs'),
  sh: () => import('shiki/langs/shellscript.mjs'),
  bash: () => import('shiki/langs/shellscript.mjs'),
  zsh: () => import('shiki/langs/shellscript.mjs'),
  ps1: () => import('shiki/langs/powershell.mjs'),
  psm1: () => import('shiki/langs/powershell.mjs'),
  bat: () => import('shiki/langs/bat.mjs'),
  cmd: () => import('shiki/langs/bat.mjs'),
  py: () => import('shiki/langs/python.mjs'),
  rs: () => import('shiki/langs/rust.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  kt: () => import('shiki/langs/kotlin.mjs'),
  kts: () => import('shiki/langs/kotlin.mjs'),
  gradle: () => import('shiki/langs/groovy.mjs'),
  groovy: () => import('shiki/langs/groovy.mjs'),
  c: () => import('shiki/langs/c.mjs'),
  h: () => import('shiki/langs/c.mjs'),
  cs: () => import('shiki/langs/csharp.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  dockerfile: () => import('shiki/langs/dockerfile.mjs'),
  makefile: () => import('shiki/langs/make.mjs'),
  diff: () => import('shiki/langs/diff.mjs'),
};

/**
 * A highlighter with the name of the theme that it colors code in.
 */
interface PageHighlighter {
  /**
   * The highlighter, with the grammars of the languages that it loaded so far.
   */
  instance: HighlighterCore;

  /**
   * The name of the theme of the colors of the code.
   */
  theme: string;
}

/**
 * The highlighter of the page with the theme of the colors of the code, created on the first file to color, or
 * `undefined` before.
 */
let highlighter: Promise<PageHighlighter> | undefined;

/**
 * Creates the highlighter of the page. Its code loads only now, so that a page without a file to color does not load
 * it. The app always shows the dark variant of its themes, so the code takes the colors of a dark theme.
 */
const createPageHighlighter = async (): Promise<PageHighlighter> => {
  const [{ createHighlighterCore }, { createJavaScriptRegexEngine }, theme] = await Promise.all([
    import('shiki/core'),
    import('shiki/engine/javascript'),
    import('shiki/themes/github-dark-default.mjs'),
  ]);
  const instance = await createHighlighterCore({
    themes: [theme.default],
    langs: [],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
  return { instance, theme: theme.default.name ?? '' };
};

/**
 * Returns the loader of the grammar of the file at `path`, by its extension or else by its whole name, such as
 * `Dockerfile`, or `undefined` when neither names a language that gets colors.
 */
const languageOf = (path: string): LanguageLoader | undefined => {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  const extension = name.slice(name.lastIndexOf('.') + 1);
  return LANGUAGES[extension] ?? LANGUAGES[name];
};

/**
 * Colors the lines `lines` of one side of a hunk as one piece of code in the language `language` and the theme
 * `theme`, so that a construct that spans lines, such as a block comment, colors each of its lines, and adds the
 * colors of each line to `colors`.
 */
const colorSide = (
  instance: HighlighterCore,
  language: string,
  theme: string,
  lines: readonly DiffLine[],
  colors: Map<DiffLine, readonly ThemedToken[]>,
) => {
  const code = lines.map((line) => line.text).join('\n');
  const { tokens } = instance.codeToTokens(code, { lang: language, theme, tokenizeMaxLineLength: MAX_LINE_LENGTH });
  // A line that holds a line break of its own splits in two, so its colors would land on the lines below it.
  if (tokens.length !== lines.length) return;
  for (const [index, line] of lines.entries()) {
    colors.set(line, tokens[index] ?? []);
  }
};

/**
 * Colors the old and then the new side of the hunk `hunk`, so that a line both sides share keeps the colors of its new
 * side.
 */
const colorHunk = (
  instance: HighlighterCore,
  language: string,
  theme: string,
  hunk: DiffHunk,
  colors: Map<DiffLine, readonly ThemedToken[]>,
) => {
  const oldLines = hunk.lines.filter((line) => line.kind !== 'add');
  const newLines = hunk.lines.filter((line) => line.kind !== 'delete');
  colorSide(instance, language, theme, oldLines, colors);
  colorSide(instance, language, theme, newLines, colors);
};

/**
 * Returns the colors of the lines of the file `file`, each hunk colored on its own. If the language of the file gets
 * no colors, or the file is too large, returns no colors instead.
 */
const highlightFile = async (file: FileDiff): Promise<FileHighlight> => {
  const colors = new Map<DiffLine, readonly ThemedToken[]>();
  const loadLanguage = languageOf(file.path);
  const lineCount = file.hunks.reduce((count, hunk) => count + hunk.lines.length, 0);
  if (loadLanguage === undefined || lineCount > MAX_LINES) return colors;
  highlighter ??= createPageHighlighter();
  const [{ instance, theme }, grammars] = await Promise.all([highlighter, loadLanguage()]);
  await instance.loadLanguage(grammars.default);
  // The grammars of the embedded languages come first, and the grammar of the language itself last.
  const language = grammars.default.at(-1)?.name ?? '';
  for (const hunk of file.hunks) {
    colorHunk(instance, language, theme, hunk, colors);
  }
  return colors;
};

/**
 * The colors of each file that was colored once, so that a file that shows again does not color again.
 */
const highlights = new WeakMap<FileDiff, FileHighlight>();

/**
 * Returns the colors of the lines of the file `file`, or `undefined` while they load. If the colors fail to load, the
 * file keeps showing its text without colors.
 */
export const useFileHighlight = (file: FileDiff): FileHighlight | undefined => {
  const [highlight, setHighlight] = useState(() => highlights.get(file));

  useEffect(() => {
    const known = highlights.get(file);
    setHighlight(known);
    if (known !== undefined) return;
    let current = true;
    highlightFile(file).then(
      (loaded) => {
        highlights.set(file, loaded);
        if (current) setHighlight(loaded);
      },
      (error: unknown) => console.error(`Failed to color the code of ${file.path}.`, error),
    );
    return () => {
      current = false;
    };
  }, [file]);

  return highlight;
};
