import { join } from 'node:path';

/**
 * Name of each entry point of the MCP project that the plugin runs, which is the name of its bundle without
 * `BUNDLE_EXTENSION`. The source of the entry point `<name>` is `src/<name>.main.ts`.
 */
export const BUNDLED_ENTRY_POINTS = [
  'session-server',
  'repository-server',
  'await-command',
  'session-start',
  'session-activity',
  'permission-request',
] as const;

/**
 * Name of an entry point of the MCP project that the plugin runs, one of `BUNDLED_ENTRY_POINTS`.
 */
type BundledEntryPoint = (typeof BUNDLED_ENTRY_POINTS)[number];

/**
 * Extension of every bundle in `plugin/dist/`.
 */
export const BUNDLE_EXTENSION = '.mjs';

/**
 * Whether this module runs from the sources in `mcp/src/entry/`, rather than from a bundle in `plugin/dist/`, which
 * holds the code of this module.
 */
const isSource = (): boolean => import.meta.filename.endsWith('.ts');

/**
 * Returns the absolute path of the entry point `name`, as the running code holds it: `<name>.main.ts` in `mcp/src/`
 * when it runs from the sources, and `<name>.mjs` beside the running bundle when it runs from a bundle.
 */
export const entryPointPath = (name: BundledEntryPoint): string =>
  isSource()
    ? join(import.meta.dirname, '..', `${name}.main.ts`)
    : join(import.meta.dirname, `${name}${BUNDLE_EXTENSION}`);

/**
 * Returns the absolute path of the directory of the built web app, `plugin/dist/web/`: `web` beside the running bundle
 * when it runs from a bundle, and `plugin/dist/web` of the root of the repository when it runs from the sources.
 */
export const webDirectoryPath = (): string =>
  isSource() ? join(import.meta.dirname, '..', '..', '..', 'plugin', 'dist', 'web') : join(import.meta.dirname, 'web');
