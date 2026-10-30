/**
 * Store of short strings that the browser keeps for the next visits of the page, such as the theme that the user
 * picked. A store that the browser refuses, such as a full one or one that its settings block, holds nothing and keeps
 * nothing, and none of its functions throws.
 */
export interface BrowserStore {
  /**
   * Returns the string that the store holds at the key `key`. If it holds none, or the browser refuses the store,
   * returns `undefined` instead.
   */
  read(key: string): string | undefined;

  /**
   * Keeps the string `value` at the key `key`, in place of any string that the key held. Returns `false` when the
   * browser refuses the write, such as for a full store, and `true` otherwise.
   */
  write(key: string, value: string): boolean;

  /**
   * Removes the string at the key `key`. Returns `false` when the browser refuses the removal, and `true` otherwise.
   */
  remove(key: string): boolean;
}
