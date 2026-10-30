/**
 * Files and directories of the worktrees and of the state that git keeps in them.
 */
export interface FileSystem {
  /**
   * Returns whether something exists at the absolute path `path`. A path that cannot be reached counts as one that
   * does not exist.
   */
  exists(path: string): Promise<boolean>;

  /**
   * Returns the text of the file at the absolute path `path`, read as UTF-8.
   * If the file cannot be read, rejects with the error of the read.
   */
  readText(path: string): Promise<string>;

  /**
   * Makes the directory at the absolute path `path` with every missing parent. A directory that exists stays.
   * If the directory cannot be made, rejects with the error of the file system.
   */
  makeDirectory(path: string): Promise<void>;

  /**
   * Deletes the directory at the absolute path `path` with its contents, with retries while another program holds it
   * for a moment. A directory that does not exist is no error.
   * If the directory stays, rejects with the error of the last try.
   */
  removeDirectory(path: string): Promise<void>;
}
