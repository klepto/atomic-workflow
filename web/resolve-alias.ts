import { registerHooks } from 'node:module';

/**
 * Prefix of the specifiers that the alias `@/` of `vite.config.ts` and the paths of `tsconfig.json` resolve.
 */
const ALIAS = '@/';

/**
 * URL of the directory that the alias `@/` stands for: `web/src/`.
 */
const SOURCE_URL = new URL('./src/', import.meta.url);

// Resolves `@/<path>` to `web/src/<path>` for the test runner of Node.js, which knows neither the alias of Vite nor
// the paths of `tsconfig.json`. `npm test` loads this module with `--import`.
registerHooks({
  resolve: (specifier, context, nextResolve) =>
    nextResolve(
      specifier.startsWith(ALIAS) ? new URL(specifier.slice(ALIAS.length), SOURCE_URL).href : specifier,
      context,
    ),
});
