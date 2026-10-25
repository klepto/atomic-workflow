import { directoryCreateStaticFiles } from './static-files.directory.ts';

/**
 * One file of the web app, as a response carries it.
 */
export interface StaticFile {
  /**
   * Bytes of the file.
   */
  readonly content: Uint8Array;

  /**
   * Content type of the file, from its extension. A file with an extension outside the list is a download, so a
   * browser never runs it as a script or a page.
   */
  readonly contentType: string;

  /**
   * Cache rule of the file, as the value of `Cache-Control`, or `undefined` for a file without a rule.
   */
  readonly cacheControl: string | undefined;
}

/**
 * Answer to the path of one request:
 *
 * - `file`: the path names a file.
 * - `fallback`: the path names no file, so the answer is `index.html`, the page of the web app.
 * - `refused`: the path is not one of a file of the web app, and nothing was read for it.
 * - `missing`: the path names no file and the web app has no `index.html`, so it is not built.
 */
export type StaticAnswer =
  | {
      /**
       * Kind of the answer.
       */
      readonly kind: 'file' | 'fallback';

      /**
       * File to answer with.
       */
      readonly file: StaticFile;
    }
  | {
      /**
       * Kind of the answer.
       */
      readonly kind: 'refused';

      /**
       * Sentence that names the reason the path was refused.
       */
      readonly message: string;
    }
  | {
      /**
       * Kind of the answer.
       */
      readonly kind: 'missing';
    };

/**
 * Files of the web app.
 */
export interface StaticFiles {
  /**
   * Returns the answer to `path`, the path of a request as it was sent, without its query.
   * The path is decoded once. A path that names a file returns that file. `index.html` is never cached, and a
   * file below `assets/` is immutable for one year.
   * If the path names no file, or names a directory, returns `index.html` as the fallback instead, or `missing`
   * when the web app has none.
   * If the path has a broken percent code, has `\`, `:` or a NUL character, or leaves the web app, returns a
   * refusal instead.
   */
  find(path: string): Promise<StaticAnswer>;
}

/**
 * Parts that `StaticFiles` are built from.
 */
export interface StaticFilesDependencies {
  /**
   * Absolute path of the directory that holds the web app. It may not exist.
   */
  readonly directory: string;
}

/**
 * Function that returns the `StaticFiles` of the directory of `dependencies`.
 */
export type CreateStaticFilesFunction = (dependencies: StaticFilesDependencies) => StaticFiles;

/**
 * Default `CreateStaticFilesFunction`, which reads the files of one directory on disk.
 */
export const CreateStaticFiles: CreateStaticFilesFunction = directoryCreateStaticFiles;
