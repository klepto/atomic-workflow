import type { CSSProperties } from 'react';
import type { GrammarState, HighlighterCore, LanguageRegistration, ThemedToken } from 'shiki/core';
import { bundledLanguagesInfo } from 'shiki/langs';

/**
 * Function that loads the grammar of a language, after the grammars of the languages that it embeds. Resolves to the
 * module of the grammars, and rejects when a chunk of the app fails to load.
 */
type LanguageLoader = () => Promise<{ default: LanguageRegistration[] }>;

/**
 * Highlighter that colors code in one language.
 */
export interface LanguageHighlighter {
  /**
   * Returns the colored pieces of each line of the code `code`, one array per line. A line longer than
   * `MAX_LINE_LENGTH` gets one color.
   */
  tokenize(code: string): ThemedToken[][];

  /**
   * Returns the colored pieces of each line of the code `code`, one array per line, read on from the grammar state
   * `state` where an earlier piece of code ended, or from the start while `state` is `undefined`, with the grammar
   * state where `code` ends. A line longer than `MAX_LINE_LENGTH` gets one color.
   */
  tokenizeFrom(code: string, state: GrammarState | undefined): TokenizedCode;
}

/**
 * Colored pieces of each line of a piece of code, with the grammar state where the code ends.
 */
export interface TokenizedCode {
  /**
   * Colored pieces of each line, one array per line.
   */
  readonly tokens: ThemedToken[][];

  /**
   * Grammar state where the code ends, which the next piece of the same code reads on from, or `undefined` when the
   * highlighter gave none.
   */
  readonly state: GrammarState | undefined;
}

/**
 * Highlighter of the page with the name of the theme that it colors code in.
 */
interface PageHighlighter {
  /**
   * Highlighter, with the grammars of the languages that it loaded so far.
   */
  readonly instance: HighlighterCore;

  /**
   * Name of the theme of the colors of the code.
   */
  readonly theme: string;
}

/**
 * Longest line that gets colors, in characters. A longer line, such as one of minified code, shows its text in one
 * color.
 */
const MAX_LINE_LENGTH = 1000;

/**
 * Most lines of code that get colors. Longer code shows its text without colors, so that it does not hold up the page.
 */
export const MAX_HIGHLIGHT_LINES = 5000;

/**
 * Identifiers of the languages of Shiki by the names that the index of Shiki gives no language, or another language
 * than the app gives them, in lower case: extensions of files, such as `hpp` for C++, and names of fenced code
 * blocks, such as `golang` for Go. `console` names Shell here, where Shiki names the shell session.
 */
const EXTRA_NAMES: Readonly<Record<string, string>> = {
  cc: 'cpp',
  cljc: 'clojure',
  cljs: 'clojure',
  console: 'shellscript',
  cr: 'crystal',
  csproj: 'xml',
  csx: 'csharp',
  cxx: 'cpp',
  edn: 'clojure',
  el: 'emacs-lisp',
  env: 'dotenv',
  ex: 'elixir',
  exs: 'elixir',
  frag: 'glsl',
  fsi: 'fsharp',
  fsx: 'fsharp',
  golang: 'go',
  gradle: 'groovy',
  h: 'c',
  hh: 'cpp',
  hpp: 'cpp',
  hrl: 'erlang',
  htm: 'html',
  hxx: 'cpp',
  ml: 'ocaml',
  mli: 'ocaml',
  mm: 'objective-cpp',
  patch: 'diff',
  pl: 'perl',
  pm: 'perl',
  psd1: 'powershell',
  psm1: 'powershell',
  purs: 'purescript',
  sol: 'solidity',
  sv: 'system-verilog',
  svg: 'xml',
  vert: 'glsl',
  vhd: 'vhdl',
  wat: 'wasm',
  xaml: 'xml',
  xsd: 'xml',
  xslt: 'xsl',
};

/**
 * Loaders of the grammars of every language that Shiki ships, by each name of the language in lower case: its
 * identifier and its aliases in the index of Shiki, such as `gdscript` and `gd`, and the names of `EXTRA_NAMES`. A
 * name of `EXTRA_NAMES` wins over the index, and an identifier over an alias of another language. Each grammar loads
 * on the first code that needs it, from a chunk of its own.
 */
const languageLoaders: ReadonlyMap<string, LanguageLoader> = new Map([
  ...bundledLanguagesInfo.flatMap((info) =>
    (info.aliases ?? []).map((alias): [string, LanguageLoader] => [alias.toLowerCase(), info.import]),
  ),
  ...bundledLanguagesInfo.map((info): [string, LanguageLoader] => [info.id.toLowerCase(), info.import]),
  ...Object.entries(EXTRA_NAMES).flatMap(([name, id]): [string, LanguageLoader][] => {
    const info = bundledLanguagesInfo.find((language) => language.id === id);
    return info === undefined ? [] : [[name, info.import]];
  }),
]);

/**
 * Highlighter of the page with the theme of the colors of the code, created on the first code to color, or
 * `undefined` before.
 */
let highlighter: Promise<PageHighlighter> | undefined;

/**
 * Returns the loader of the grammar of the file at `path`, by its extension, such as `gd` for GDScript, or else by its
 * whole name, such as `Dockerfile`, in any case. If neither names a language of Shiki, returns `undefined` instead.
 */
export const languageOfPath = (path: string): LanguageLoader | undefined => {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  const extension = name.slice(name.lastIndexOf('.') + 1);
  return languageLoaders.get(extension) ?? languageLoaders.get(name);
};

/**
 * Returns the loader of the grammar of the language `name` of a fenced code block, such as `ts` or `typescript`, in
 * any case. If the name is not a language of Shiki, returns `undefined` instead.
 */
export const languageOfFence = (name: string): LanguageLoader | undefined => languageLoaders.get(name.toLowerCase());

/**
 * Creates the highlighter of the page, and returns it with the name of its theme. Its code loads only now, so that a
 * page without code to color does not load it. The app always shows the dark variant of its themes, so the code takes
 * the colors of a dark theme. Rejects when a chunk of shiki fails to load.
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
 * Returns a highlighter of the language that `loadLanguage` loads, once the grammar of the language loaded. The first
 * call creates the highlighter of the page, which every later call shares. Rejects when the highlighter or the grammar
 * fails to load.
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
    tokenizeFrom: (code, state) => {
      const result = instance.codeToTokens(code, {
        lang: language,
        theme,
        tokenizeMaxLineLength: MAX_LINE_LENGTH,
        grammarState: state,
      });
      return { tokens: result.tokens, state: result.grammarState };
    },
  };
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
