/**
 * Files of the transcripts of an agent, and the files that the agent keeps beside them.
 */
export interface TranscriptFiles {
  /**
   * Returns the text of the file at `path`, read as UTF-8. If the file does not exist, returns `undefined` instead.
   * Rejects when the file exists but cannot be read.
   */
  readText(path: string): Promise<string | undefined>;

  /**
   * Returns the text of the first `length` bytes of the file at `path`, read as UTF-8, or of the whole file when it
   * is shorter. Rejects when the file cannot be opened or read, such as when it does not exist.
   */
  readStart(path: string, length: number): Promise<string>;

  /**
   * Returns whether a file or a directory exists at `path`. A path that cannot be accessed counts as missing.
   */
  exists(path: string): Promise<boolean>;

  /**
   * Returns the names of the entries of the directory at `directory`, in no fixed order. If the directory does not
   * exist, returns an empty list instead. Rejects when it exists but cannot be read.
   */
  listNames(directory: string): Promise<readonly string[]>;

  /**
   * Returns the names of the directories in the directory at `directory`, in no fixed order. If the directory does not
   * exist, returns an empty list instead. Rejects when it exists but cannot be read.
   */
  listDirectories(directory: string): Promise<readonly string[]>;
}
