import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { build, type OutputFile } from 'esbuild';

/**
 * Absolute path of the root of the MCP project.
 */
const ROOT = join(import.meta.dirname, '..');

/**
 * Absolute path of the root of the repository, which holds the MCP project and the plugin.
 */
const REPOSITORY_ROOT = join(ROOT, '..');

/**
 * Absolute path of the directory of the bundles in the plugin.
 */
const DIST_DIRECTORY = join(REPOSITORY_ROOT, 'plugin', 'dist');

/**
 * Entry point of each bundle, relative to the root of the MCP project, keyed by the name of the bundle without its
 * extension.
 */
const ENTRY_POINTS: Readonly<Record<string, string>> = {
  'session-server': 'src/session-server.main.ts',
  'repository-server': 'src/repository-server.main.ts',
  'await-command': 'src/await-command.main.ts',
  'session-start': 'src/session-start.main.ts',
  'session-activity': 'src/session-activity.main.ts',
};

/**
 * Extension of every bundle.
 */
const BUNDLE_EXTENSION = '.mjs';

/**
 * Builds the plugin: one self-contained bundle per entry point in `plugin/dist/`. The output holds no time and no
 * absolute path, and every line ends with a line feed, so a second build on any system gives the same bytes.
 */
const main = async (): Promise<void> => {
  const bundles = await bundle();
  await removeBundles();
  for (const file of bundles) await writeFile(file.path, file.text.replaceAll('\r\n', '\n'));
  for (const file of bundles) process.stdout.write(`${relative(REPOSITORY_ROOT, file.path).replaceAll('\\', '/')}\n`);
};

/**
 * Returns the bundle of each entry point of `ENTRY_POINTS`, in memory. Every package is bundled, so a bundle runs
 * without `node_modules`. Only the built-in modules of Node.js stay imports.
 */
const bundle = async (): Promise<readonly OutputFile[]> => {
  const result = await build({
    absWorkingDir: ROOT,
    entryPoints: Object.entries(ENTRY_POINTS).map(([name, path]) => ({ in: path, out: name })),
    outdir: DIST_DIRECTORY,
    outExtension: { '.js': BUNDLE_EXTENSION },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    write: false,
    logLevel: 'warning',
  });
  return result.outputFiles;
};

/**
 * Removes every bundle of an earlier build from `plugin/dist/`, so a bundle of an entry point that is gone does not
 * stay behind.
 */
const removeBundles = async (): Promise<void> => {
  await mkdir(DIST_DIRECTORY, { recursive: true });
  const names = await readdir(DIST_DIRECTORY);
  const bundles = names.filter((name) => name.endsWith(BUNDLE_EXTENSION));
  await Promise.all(bundles.map((name) => rm(join(DIST_DIRECTORY, name))));
};

await main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
