import { WorktreeError } from '../worktree/worktree-error.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';

/**
 * Returns the value of the call on the worktrees `call`. A `WorktreeError` fails with an invalid request, whose data
 * holds its kind and its conflicting files, and for `needs-checks` the worktree and the commit of the candidate. A
 * refusal `invalid-checks` fails with invalid parameters instead. Any other failure rejects as it is.
 */
export const worktreeCall = async <Value>(call: () => Promise<Value>): Promise<Value> => {
  try {
    return await call();
  } catch (error) {
    if (!(error instanceof WorktreeError)) throw error;
    const code = error.kind === 'invalid-checks' ? RPC_ERROR_CODES.INVALID_PARAMS : RPC_ERROR_CODES.INVALID_REQUEST;
    throw new RpcError(code, error.message, { kind: error.kind, files: error.files, ...error.candidate });
  }
};
