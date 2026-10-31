import { z } from 'zod';

/**
 * Schema of the checks that a caller ran on the candidate of a rebased task branch, after a refusal `needs-checks`.
 */
export const REBASE_CHECKS = z
  .object({
    commit: z
      .string()
      .regex(/^[0-9a-f]{40}([0-9a-f]{24})?$/, 'Must be the full hash of a commit')
      .describe('Full hash of the candidate, the commit of the refusal needs-checks'),
    failure: z
      .object({
        command: z.string().min(1).describe('Command of the check that failed'),
        output: z.string().describe('Output of the command'),
      })
      .nullable()
      .describe('First check that failed, with its output, or null when every check passed'),
  })
  .describe(
    'Result of the checks that ran in the worktree of a refusal needs-checks: each command of ## Verify of each ticket of the task that is needs-review or done. Only after such a refusal',
  );
