/**
 * Kinds of a refused call on the worktrees: `not-allowed` for a call that the state of the repository does not allow,
 * `conflict` for a rebase that stopped on files that need a resolution, `needs-checks` for a rebased task branch whose
 * candidate waits for its checks, and `invalid-checks` for checks that name no candidate.
 */
export const WORKTREE_ERROR_KINDS = ['not-allowed', 'conflict', 'needs-checks', 'invalid-checks'] as const;

/**
 * Kind of a refused call on the worktrees, one of `WORKTREE_ERROR_KINDS`.
 */
export type WorktreeErrorKind = (typeof WORKTREE_ERROR_KINDS)[number];

/**
 * Candidate of a rebased task branch that waits for its checks.
 */
export interface CandidateDetails {
  /**
   * Absolute path of the worktree whose files are the tree of the candidate, with forward slashes.
   */
  readonly worktree: string;

  /**
   * Full hash of the candidate.
   */
  readonly commit: string;
}

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
   * Candidate that waits for its checks, for a `needs-checks`. `undefined` for every other kind.
   */
  readonly candidate: CandidateDetails | undefined;

  /**
   * Creates the refusal of the kind `kind` with the description `message`, the conflicting files `files` and the
   * candidate `candidate`.
   */
  constructor(kind: WorktreeErrorKind, message: string, files: readonly string[] = [], candidate?: CandidateDetails) {
    super(message);
    this.name = 'WorktreeError';
    this.kind = kind;
    this.files = files;
    this.candidate = candidate;
  }
}
