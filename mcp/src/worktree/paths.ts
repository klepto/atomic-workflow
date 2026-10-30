import { posix, win32 } from 'node:path';

/**
 * Returns `path` with forward slashes, the form of every path that a result or a message of the worktrees shows.
 */
export const forwardSlashes = (path: string): string => path.replaceAll('\\', '/');

/**
 * Returns `path` absolute, and on the platform `platform` `win32` in lower case, so two spellings of one path give the
 * same text.
 */
export const comparablePath = (path: string, platform: NodeJS.Platform): string => {
  const absolute = platformPaths(platform).resolve(path);
  return platform === 'win32' ? absolute.toLowerCase() : absolute;
};

/**
 * Returns whether `first` and `second` name the same path on the platform `platform`.
 */
export const samePath = (first: string, second: string, platform: NodeJS.Platform): boolean =>
  comparablePath(first, platform) === comparablePath(second, platform);

/**
 * Returns whether `path` is the directory `directory` or lies below it on the platform `platform`.
 */
export const isBelow = (directory: string, path: string, platform: NodeJS.Platform): boolean =>
  relativeInside(comparablePath(directory, platform), comparablePath(path, platform), platform) !== undefined;

/**
 * Returns the path of `path` relative to the directory `directory` on the platform `platform`: an empty string for the
 * directory itself. If `path` lies outside the directory, returns `undefined` instead.
 */
export const relativeInside = (directory: string, path: string, platform: NodeJS.Platform): string | undefined => {
  const paths = platformPaths(platform);
  const inside = paths.relative(directory, path);
  if (paths.isAbsolute(inside) || inside === '..' || inside.startsWith(`..${paths.sep}`)) return undefined;
  return inside;
};

/**
 * Returns the path functions of Node.js for the platform `platform`: the ones of Windows for `win32`, else the ones of
 * POSIX.
 */
export const platformPaths = (platform: NodeJS.Platform): typeof posix => (platform === 'win32' ? win32 : posix);
