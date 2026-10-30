import type { CSSProperties } from 'react';
import type { HighlighterCore, LanguageRegistration, ThemedToken } from 'shiki/core';

/**
 * Loads the grammar of a language, after the grammars of the languages that it embeds.
 */
export type LanguageLoader = () => Promise<{ default: LanguageRegistration[] }>;

/**
 * A highlighter that colors code in one language.
 */
export interface LanguageHighlighter {
  /**
   * Returns the colored pieces of each line of the code `code`, one array per line. A line longer than
   * `MAX_LINE_LENGTH` gets one color.
   */
  tokenize: (code: string) => ThemedToken[][];
}

/**
 * The longest line that gets colors. A longer line, such as one of minified code, shows its text in one color.
 */
const MAX_LINE_LENGTH = 1000;

/**
 * The languages that get colors, by the extension of a file, or by its whole name for a file without one. Only these
 * grammars ship with the app, each loaded on the first code that needs it.
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
 * The names of the languages that a fenced code block of Markdown gives beside the extensions of `LANGUAGES`, such as
 * `typescript` for `ts`.
 */
const FENCE_NAMES: Readonly<Record<string, string>> = {
  typescript: 'ts',
  javascript: 'js',
  shell: 'sh',
  shellscript: 'sh',
  console: 'sh',
  powershell: 'ps1',
  pwsh: 'ps1',
  batch: 'bat',
  python: 'py',
  rust: 'rs',
  golang: 'go',
  kotlin: 'kt',
  csharp: 'cs',
  docker: 'dockerfile',
  make: 'makefile',
  patch: 'diff',
};

/**
 * Returns the loader of the grammar of the file at `path`, by its extension or else by its whole name, such as
 * `Dockerfile`. If neither names a language that gets colors, returns `undefined` instead.
 */
export const languageOfPath = (path: string): LanguageLoader | undefined => {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  const extension = name.slice(name.lastIndexOf('.') + 1);
  return LANGUAGES[extension] ?? LANGUAGES[name];
};

/**
 * Returns the loader of the grammar of the language `name` of a fenced code block, such as `ts` or `typescript`. If
 * the name is not a language that gets colors, returns `undefined` instead.
 */
export const languageOfFence = (name: string): LanguageLoader | undefined => {
  const lowered = name.toLowerCase();
  return LANGUAGES[FENCE_NAMES[lowered] ?? lowered];
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
 * The highlighter of the page with the theme of the colors of the code, created on the first code to color, or
 * `undefined` before.
 */
let highlighter: Promise<PageHighlighter> | undefined;

/**
 * Returns a highlighter of the language that `loadLanguage` loads, once the grammar of the language loaded. The first
 * call creates the highlighter of the page, which every later call shares.
 */
export const highlighterOf = async (loadLanguage: LanguageLoader): Promise<LanguageHighlighter> => {
  highlighter ??= createPageHighlighter();
  const [{ instance, theme }, grammars] = await Promise.all([highlighter, loadLanguage()]);
  await instance.loadLanguage(grammars.default);
  // The grammars of the embedded languages come first, and the grammar of the language itself last.
  const language = grammars.default.at(-1)?.name ?? '';
  return {
    tokenize: (code) =>
      instance.codeToTokens(code, { lang: language, theme, tokenizeMaxLineLength: MAX_LINE_LENGTH }).tokens,
  };
};

/**
 * Creates the highlighter of the page. Its code loads only now, so that a page without code to color does not load
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
 * Returns the inline style of the token `token`: its color, and whether it is italic, bold or underlined.
 */
export const tokenStyle = (token: ThemedToken): CSSProperties => {
  // The font style is a bit set: 1 for italic, 2 for bold and 4 for underline.
  const fontStyle = token.fontStyle ?? 0;
  return {
    color: token.color,
    fontStyle: fontStyle & 1 ? 'italic' : undefined,
    fontWeight: fontStyle & 2 ? 'bold' : undefined,
    textDecoration: fontStyle & 4 ? 'underline' : undefined,
  };
};
