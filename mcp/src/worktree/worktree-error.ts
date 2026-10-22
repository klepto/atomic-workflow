/**
 * Kinds of a refused call on the worktrees: `not-allowed` for a call that the state of the repository does not allow,
 * and `conflict` for a rebase that stopped on files that need a resolution.
 */
export const WORKTREE_ERROR_KINDS = ['not-allowed', 'conflict'] as const;

/**
 * Kind of a refused call on the worktrees, one of `WORKTREE_ERROR_KINDS`.
 */
export type WorktreeErrorKind = (typeof WORKTREE_ERROR_KINDS)[number];

/**
 * Refusal of a call on the worktrees, with a message that says what to do about it.
 */
export class WorktreeError extends Error {
  /**
   * Kind of the refusal.
   */
  readonly kind: WorktreeErrorKind;

  /**
   * Paths of the files in conflict, relative to the worktree and with forward slashes, for a `conflict`. Empty for
   * every other kind.
   */
  readonly files: readonly string[];

  /**
   * Creates the refusal of the kind `kind` with the description `message` and the conflicting files `files`.
   */
  constructor(kind: WorktreeErrorKind, message: string, files: readonly string[] = []) {
    super(message);
    this.name = 'WorktreeError';
    this.kind = kind;
    this.files = files;
  }
}
