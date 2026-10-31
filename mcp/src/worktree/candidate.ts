import { forwardSlashes, samePath } from './paths.ts';
import { continueRebase, isRebasing, type StoppedRebase, startRebase } from './rebase.ts';
import { type GitOutput, gitFailure, gitOutput, lastLines, lastLinesOf } from './run-git.ts';
import { WorktreeError } from './worktree-error.ts';
import { branchRef, candidateRefsOf } from './worktree-layout.ts';
import { listWorktrees } from './worktree-list.ts';
import type { CheckFailure, RebaseChecks, WorktreePlace } from './worktrees.ts';
import type { WorktreesContext } from './worktrees-context.ts';

/**
 * Last part of the name of the reference that holds the candidate.
 */
const COMMIT_PART = 'commit';

/**
 * Last part of the name of the reference that holds the tip of the task branch that the candidate was rebased from.
 */
const TASK_PART = 'task';

/**
 * Last part of the name of the reference that holds the tip of the base branch that the candidate was rebased onto.
 */
const BASE_PART = 'base';

/**
 * Rebase of a task branch onto its base branch whose result waits for its checks before the task branch moves to it.
 */
interface Candidate {
  /**
   * Full hash of the rebased commit, or `undefined` while the rebase has not ended.
   */
  readonly commit: string | undefined;

  /**
   * Tip of the task branch when the rebase started.
   */
  readonly taskTip: string;

  /**
   * Tip of the base branch that the rebase put the commits onto.
   */
  readonly baseTip: string;
}

/**
 * Candidate whose rebase ended.
 */
interface EndedCandidate extends Candidate {
  /**
   * Full hash of the rebased commit.
   */
  readonly commit: string;
}

/**
 * Outcome of the checks of a candidate: `passed` when the task branch holds the candidate now, `moved` when a branch
 * moved while the checks ran and the candidate was dropped, or the check that failed when the candidate was dropped
 * for it.
 */
export type ChecksOutcome = 'passed' | 'moved' | CheckFailure;

/**
 * Returns whether the task branch `branch` in the repository of `context` has a candidate, whose rebase may not have
 * ended yet.
 */
export const hasCandidate = async (branch: string, context: WorktreesContext): Promise<boolean> => {
  const commandLine = ['for-each-ref', '--count=1', '--format=%(refname)', candidateRefsOf(branch)];
  const output = await context.runGit(context.layout.checkout, commandLine);
  return output.exitCode === 0 && output.stdout.trim() !== '';
};

/**
 * Rebases the task branch of `place` onto the tip `baseTip` of the base branch `baseBranch` as a candidate, in its
 * worktree with a detached `HEAD`, so the task branch stays where it is. The worktree must exist, have the task branch
 * checked out, and have no candidate.
 * If the rebase stops, rejects as `checkRebaseEnded` of `rebase.ts` does, with `retry`. Else rejects with
 * `needs-checks` for the candidate, which asks the caller to `retry` with the checks.
 */
export const startCandidate = async (
  place: WorktreePlace,
  baseBranch: string,
  baseTip: string,
  retry: string,
  context: WorktreesContext,
): Promise<never> => {
  const refs = candidateRefsOf(place.branch);
  const taskTip = await gitOutput(place.path, ['rev-parse', 'HEAD'], context.runGit);
  const input = `update ${refs}${TASK_PART} ${taskTip}\nupdate ${refs}${BASE_PART} ${baseTip}\n`;
  await updateRefs(input, context);
  await gitOutput(place.path, ['switch', '--quiet', '--detach'], context.runGit);
  await startRebase(place, baseBranch, [baseTip], retry, context);
  return recordCandidate(place, baseBranch, retry, context);
};

/**
 * Returns whether the stopped rebase `rebase` in the worktree of `place` in the repository of `context` is the rebase
 * of a candidate of the task branch of `place`.
 * If git fails, rejects with the error of `gitFailure`.
 */
export const isCandidateRebase = async (
  rebase: StoppedRebase,
  place: WorktreePlace,
  context: WorktreesContext,
): Promise<boolean> => rebase.branch === undefined && (await readCandidate(place, context)) !== undefined;

/**
 * Continues the stopped rebase `rebase` of the candidate of the task branch of `place` onto the base branch
 * `baseBranch` in the repository of `context`, once every conflicting file is resolved and added.
 * If `rebase` is no rebase of a candidate, rejects with `not-allowed`. If a file still conflicts or the rebase stops
 * again, rejects as `checkRebaseEnded` of `rebase.ts` does, with `retry`. Else rejects with `needs-checks` for the
 * candidate, which asks the caller to `retry` with the checks.
 */
export const continueCandidate = async (
  place: WorktreePlace,
  baseBranch: string,
  rebase: StoppedRebase,
  retry: string,
  context: WorktreesContext,
): Promise<never> => {
  if (!(await isCandidateRebase(rebase, place, context))) {
    throw new WorktreeError(
      'not-allowed',
      `The worktree ${forwardSlashes(place.path)} of the task branch has a stopped rebase that is no sync of ${place.branch} with ${baseBranch}. Finish or abort it there, then try again`,
    );
  }
  await continueRebase(place, baseBranch, retry, context);
  return recordCandidate(place, baseBranch, retry, context);
};

/**
 * Returns the candidate of the task branch of `place` onto the base branch `baseBranch` in the repository of `context`
 * that waits for its checks while both branches stayed, or `undefined` when none waits. A candidate whose branches
 * moved, or whose rebase neither ended nor stopped, such as after a crash, is dropped. Call it only when the worktree
 * of `place` has no stopped rebase.
 * If git fails, rejects with the error of `gitFailure`. If the worktree cannot go back to the task branch, rejects with
 * `not-allowed`.
 */
export const waitingCandidate = async (
  place: WorktreePlace,
  baseBranch: string,
  context: WorktreesContext,
): Promise<string | undefined> => {
  const candidate = await endedCandidate(place, context);
  if (candidate === undefined) return undefined;
  const taskTip = await tipOf(place.branch, context);
  if (await isCurrent(candidate, taskTip, baseBranch, context)) return candidate.commit;
  await endCandidate(place, context);
  return undefined;
};

/**
 * Applies the checks `checks` that a caller ran on the candidate of the task branch of `place` onto the base branch
 * `baseBranch` in the repository of `context`, and returns their outcome. A candidate whose checks passed while both
 * branches stayed becomes the task branch. A candidate whose check failed, or whose branches moved while the checks
 * ran, is dropped, and the task branch stays where it is. Checks of the commit that the task branch holds already,
 * which an earlier call moved it to, passed. Call it only when the worktree of `place` has no stopped rebase.
 * If `checks` names no candidate, rejects with `invalid-checks`. If the task branch cannot move, or its worktree cannot
 * go back to it, rejects with `not-allowed`.
 */
export const applyChecks = async (
  place: WorktreePlace,
  baseBranch: string,
  checks: RebaseChecks,
  context: WorktreesContext,
): Promise<ChecksOutcome> => {
  const candidate = await endedCandidate(place, context);
  const taskTip = await tipOf(place.branch, context);
  if (candidate === undefined) {
    if (taskTip === checks.commit) return 'passed';
    throw noCandidate(place, checks.commit);
  }
  if (candidate.commit === taskTip) {
    await endCandidate(place, context);
    return 'passed';
  }
  if (candidate.commit !== checks.commit || !(await isCurrent(candidate, taskTip, baseBranch, context))) {
    await endCandidate(place, context);
    return 'moved';
  }
  if (checks.failure !== null) {
    await endCandidate(place, context);
    return checks.failure;
  }
  await moveToCandidate(place, candidate, context);
  return 'passed';
};

/**
 * Removes the references of the candidate of the task branch `branch` in the repository of `context`, and returns the
 * output of git. A candidate that does not exist is no failure.
 */
export const removeCandidate = async (branch: string, context: WorktreesContext): Promise<GitOutput> => {
  const refs = candidateRefsOf(branch);
  const input = [COMMIT_PART, TASK_PART, BASE_PART].map((part) => `delete ${refs}${part}\n`).join('');
  return context.runGit(context.layout.checkout, ['update-ref', '--stdin'], input);
};

/**
 * Returns the refusal `needs-checks` for the candidate `commit` of the task branch of `place`, rebased onto the base
 * branch `baseBranch`, which asks the caller to `retry` with the checks.
 */
export const needsChecks = (place: WorktreePlace, baseBranch: string, commit: string, retry: string): WorktreeError =>
  new WorktreeError(
    'needs-checks',
    `The rebase of ${place.branch} onto ${baseBranch} made the candidate ${commit}, which ${place.branch} moves to only once its checks pass. Run the checks in ${forwardSlashes(place.path)}, then ${retry} with checks that name the candidate`,
    [],
    { worktree: forwardSlashes(place.path), commit },
  );

/**
 * Returns the refusal `invalid-checks` for checks of the commit `commit`, which is no candidate of the task branch of
 * `place`.
 */
export const noCandidate = (place: WorktreePlace, commit: string): WorktreeError =>
  new WorktreeError(
    'invalid-checks',
    `The commit ${commit} is no candidate of ${place.branch}, so the call takes no checks. Call it without checks`,
  );

/**
 * Returns the sentence that says that the check `failure` failed on the candidate `commit`, so `outcome` happened, and
 * ends with the last lines of its output.
 */
export const failedCheck = (failure: CheckFailure, commit: string, outcome: string): string => {
  const output = lastLinesOf(failure.output) || 'no output';
  return `The check ${failure.command} failed on the candidate ${commit}, so ${outcome}: ${output}`;
};

/**
 * Returns the candidate of the task branch of `place` in the repository of `context`, or `undefined` when it has none.
 * If git fails, rejects with the error of `gitFailure`.
 */
const readCandidate = async (place: WorktreePlace, context: WorktreesContext): Promise<Candidate | undefined> => {
  const commandLine = ['for-each-ref', '--format=%(refname:lstrip=-1) %(objectname)', candidateRefsOf(place.branch)];
  const stdout = await gitOutput(context.layout.checkout, commandLine, context.runGit);
  const tips = new Map<string, string>();
  for (const line of stdout.split('\n')) {
    const [part, commit] = line.split(' ');
    if (part !== undefined && commit !== undefined) tips.set(part, commit);
  }
  const taskTip = tips.get(TASK_PART);
  const baseTip = tips.get(BASE_PART);
  if (taskTip === undefined || baseTip === undefined) return undefined;
  return { commit: tips.get(COMMIT_PART), taskTip, baseTip };
};

/**
 * Returns the candidate of the task branch of `place` in the repository of `context` whose rebase ended, or `undefined`
 * when it has none. A candidate whose rebase has not ended, which the caller knows has not stopped either, is dropped.
 * If git fails, rejects with the error of `gitFailure`. If the worktree cannot go back to the task branch, rejects with
 * `not-allowed`.
 */
const endedCandidate = async (place: WorktreePlace, context: WorktreesContext): Promise<EndedCandidate | undefined> => {
  const candidate = await readCandidate(place, context);
  if (candidate === undefined) return undefined;
  if (candidate.commit !== undefined) return { ...candidate, commit: candidate.commit };
  await endCandidate(place, context);
  return undefined;
};

/**
 * Returns whether the task branch, at `taskTip`, and the base branch `baseBranch` in the repository of `context` stayed
 * where they were when `candidate` was rebased.
 */
const isCurrent = async (
  candidate: Candidate,
  taskTip: string | undefined,
  baseBranch: string,
  context: WorktreesContext,
): Promise<boolean> => taskTip === candidate.taskTip && (await tipOf(baseBranch, context)) === candidate.baseTip;

/**
 * Moves the task branch of `place` in the repository of `context` to `candidate`, from the tip that it was rebased
 * from, checks it out again in its worktree, and removes the candidate.
 * If the task branch moved, or git refuses, rejects with `not-allowed`.
 */
const moveToCandidate = async (
  place: WorktreePlace,
  candidate: EndedCandidate,
  context: WorktreesContext,
): Promise<void> => {
  const commandLine = ['update-ref', branchRef(place.branch), candidate.commit, candidate.taskTip];
  const output = await context.runGit(context.layout.checkout, commandLine);
  if (output.exitCode !== 0) {
    throw new WorktreeError(
      'not-allowed',
      `Git refused to move ${place.branch} to the candidate ${candidate.commit}: ${lastLines(output)}. Try again`,
    );
  }
  await endCandidate(place, context);
};

/**
 * Ends the candidate of the task branch of `place` in the repository of `context`: checks the task branch out again in
 * its worktree, where its files return, and removes the references of the candidate. The task branch stays where it
 * is. Call it only when the worktree of `place` has no stopped rebase.
 * If git refuses to check the task branch out, such as for changes that the checks left, rejects with `not-allowed`.
 * If git fails otherwise, rejects with the error of `gitFailure`.
 */
const endCandidate = async (place: WorktreePlace, context: WorktreesContext): Promise<void> => {
  const listed = (await listWorktrees(context.layout.checkout, context.runGit)).find((worktree) =>
    samePath(worktree.path, place.path, context.platform),
  );
  if (listed !== undefined && listed.branch === undefined && !(await isRebasing(place.path, context))) {
    const output = await context.runGit(place.path, ['switch', '--quiet', place.branch]);
    if (output.exitCode !== 0) {
      throw new WorktreeError(
        'not-allowed',
        `Git refused to check out ${place.branch} again in ${forwardSlashes(place.path)}, where the candidate of its rebase was checked out: ${lastLines(output)}. Commit or discard the changes there, then try again`,
      );
    }
  }
  const output = await removeCandidate(place.branch, context);
  if (output.exitCode !== 0) throw gitFailure(context.layout.checkout, ['update-ref', '--stdin'], output);
};

/**
 * Records the commit at `HEAD` of the worktree of `place`, where the rebase of a candidate onto the base branch
 * `baseBranch` ended, as the candidate, and rejects with `needs-checks` for it, which asks the caller to `retry`.
 * If git fails, rejects with the error of `gitFailure` instead.
 */
const recordCandidate = async (
  place: WorktreePlace,
  baseBranch: string,
  retry: string,
  context: WorktreesContext,
): Promise<never> => {
  const commit = await gitOutput(place.path, ['rev-parse', 'HEAD'], context.runGit);
  await updateRefs(`update ${candidateRefsOf(place.branch)}${COMMIT_PART} ${commit}\n`, context);
  throw needsChecks(place, baseBranch, commit, retry);
};

/**
 * Changes the references of the repository of `context` with the commands `input` of `git update-ref --stdin`, all of
 * them or none.
 * If git fails, rejects with the error of `gitFailure`.
 */
const updateRefs = async (input: string, context: WorktreesContext): Promise<void> => {
  const commandLine = ['update-ref', '--stdin'];
  const output = await context.runGit(context.layout.checkout, commandLine, input);
  if (output.exitCode !== 0) throw gitFailure(context.layout.checkout, commandLine, output);
};

/**
 * Returns the tip of the branch `branch` in the repository of `context`, or `undefined` when it does not exist.
 */
const tipOf = async (branch: string, context: WorktreesContext): Promise<string | undefined> => {
  const commandLine = ['rev-parse', '--verify', '--quiet', `${branchRef(branch)}^{commit}`];
  const output = await context.runGit(context.layout.checkout, commandLine);
  return output.exitCode === 0 ? output.stdout.trim() : undefined;
};
