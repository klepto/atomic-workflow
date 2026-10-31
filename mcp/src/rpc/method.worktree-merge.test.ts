import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { describe, it, type TestContext } from 'node:test';
import type { NewTicket, Task, TaskStatus, Ticket, TicketProgress } from '../storage/task-store.ts';
import { testCall } from '../testing/test-call.ts';
import { testConnection } from '../testing/test-connection.ts';
import { testGitRepository } from '../testing/test-git-repository.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { testCandidate, testCommit, testGit, testPathExists, testWorktrees } from '../testing/test-worktrees.ts';
import { processRunGit } from '../worktree/run-git.process.ts';
import type { RunGitFunction } from '../worktree/run-git.ts';
import { type CandidateDetails, WorktreeError } from '../worktree/worktree-error.ts';
import type { DeletedWorktrees, MergedTask, MergedTicket, RebaseChecks, Worktrees } from '../worktree/worktrees.ts';
import type { MethodContext } from './method.ts';
import { worktreeMergeMethod } from './method.worktree-merge.ts';
import { RPC_ERROR_CODES, RpcError } from './rpc-error.ts';

/**
 * Ticket of a test task: the fields of a stored ticket and of its progress that the test sets.
 */
type TicketSpec = Partial<NewTicket & TicketProgress>;

/**
 * Task of a test, with the fields that the test sets.
 */
interface TaskSpec {
  /**
   * Status of the task, `complete` by default.
   */
  readonly status?: TaskStatus;

  /**
   * Base branch of the task, `null` by default.
   */
  readonly baseBranch?: string | null;

  /**
   * Tickets of the task, one ticket in progress by default.
   */
  readonly tickets?: readonly TicketSpec[];
}

/**
 * Worktrees whose every call rejects, which each fake of a test spreads.
 */
const NO_WORKTREES: Worktrees = testMethodContext().worktrees;

/**
 * Work of a ticket that the fake worktrees of a test land.
 */
const MERGED_TICKET: MergedTicket = { taskBranch: 'atomic/1-cache-layer-redis', commit: 'abc1234' };

/**
 * Work of a task that the fake worktrees of a test land.
 */
const MERGED_TASK: MergedTask = {
  baseBranch: 'main',
  commit: 'def5678',
  deleted: {
    worktrees: ['/worktrees/1-cache-layer-redis'],
    branches: ['atomic/1-cache-layer-redis'],
    stoppedProcesses: [],
    warnings: [],
  },
};

/**
 * Removal that removed nothing.
 */
const NOTHING_DELETED: DeletedWorktrees = { worktrees: [], branches: [], stoppedProcesses: [], warnings: [] };

/**
 * Refusal of git that the fake worktrees of a test throw.
 */
const CONFLICT = new WorktreeError('conflict', 'The rebase of the ticket stopped on a conflict', ['src/cache.ts']);

/**
 * Candidate of a rebased task branch that the fake worktrees of a test name in a refusal `needs-checks`.
 */
const CANDIDATE: CandidateDetails = {
  worktree: 'C:/worktrees/1-cache-layer-redis/main',
  commit: '0123456789abcdef0123456789abcdef01234567',
};

/**
 * Refusal `needs-checks` that the fake worktrees of a test throw.
 */
const NEEDS_CHECKS = new WorktreeError('needs-checks', 'Run the checks of the candidate', [], CANDIDATE);

/**
 * Checks that passed on `CANDIDATE`.
 */
const PASSED: RebaseChecks = { commit: CANDIDATE.commit, failure: null };

/**
 * Message of the commit of a ticket in the tests.
 */
const MESSAGE = 'feat: add the cache layer';

/**
 * Returns the ticket to store as the ticket with the position `index` in its task.
 */
const newTicket = (index: number): NewTicket => ({
  mode: 'unattended',
  type: 'code',
  complexity: 'simple',
  slug: `part-${index + 1}-work`,
  summary: 'Adds a part of the cache layer',
  description: 'Add a part of the cache layer.',
  dependsOn: [],
  fixes: null,
});

/**
 * Returns the task of `spec` after it is stored in the task store of `context`.
 */
const storedTask = async (context: MethodContext, spec: TaskSpec = {}): Promise<Task> => {
  const { status = 'complete', baseBranch = null, tickets = [{ status: 'in-progress', stage: 'prototype' }] } = spec;
  const { id } = await context.tasks.create({
    slug: 'cache-layer-redis',
    createdAt: 0,
    goal: { summary: 'Cache the answers', details: null, source: 'user' },
  });
  await context.tasks.setDesign(id, 'Cache the answers in Redis.');
  await context.tasks.setTickets(
    id,
    tickets.map((_ticket, index) => newTicket(index)),
  );
  for (const [index, { status = 'not-started', stage = null, blockedReason = null }] of tickets.entries())
    await context.tasks.setTicketProgress(id, index + 1, { status, stage, blockedReason });
  await context.tasks.setStatus(id, status);
  await context.tasks.setBaseBranch(id, baseBranch);
  return taskOf(id, context);
};

/**
 * Returns the stored task `taskId` of the task store of `context`, which must exist.
 */
const taskOf = async (taskId: number, context: MethodContext): Promise<Task> => {
  const task = await context.tasks.get(taskId);
  assert.ok(task);
  return task;
};

/**
 * Returns the progress of the stored ticket `ticketId` of the task `taskId` of the task store of `context`.
 */
const progressOf = async (taskId: number, ticketId: number, context: MethodContext): Promise<TicketProgress> => {
  const ticket = (await taskOf(taskId, context)).tickets.find(({ id }) => id === ticketId);
  assert.ok(ticket);
  return { status: ticket.status, stage: ticket.stage, blockedReason: ticket.blockedReason };
};

/**
 * Returns fake worktrees whose `merge` and `mergeTask` record the arguments of each call in `calls`, with the ids of
 * the task and the ticket, and return `MERGED_TICKET` and `MERGED_TASK`.
 */
const mergingWorktrees = (calls: unknown[][]): Worktrees => ({
  ...NO_WORKTREES,
  ticketChanges: async () => undefined,
  merge: async (task, ticket, message) => {
    calls.push(['merge', task.id, ticket.id, message]);
    return MERGED_TICKET;
  },
  mergeTask: async (task, baseBranch, checks) => {
    calls.push(checks === undefined ? ['mergeTask', task.id, baseBranch] : ['mergeTask', task.id, baseBranch, checks]);
    return MERGED_TASK;
  },
});

/**
 * Returns fake worktrees whose `taskLanding` records the arguments of each call in `calls`, with the id of the task,
 * and returns `landing`.
 */
const landedWorktrees = (calls: unknown[][], landing: string | undefined): Worktrees => ({
  ...NO_WORKTREES,
  taskLanding: async (task, baseBranch) => {
    calls.push(['taskLanding', task.id, baseBranch]);
    return landing;
  },
});

/**
 * Returns fake worktrees whose `merge` and `mergeTask` reject with `CONFLICT`.
 */
const refusingWorktrees = (): Worktrees => ({
  ...NO_WORKTREES,
  merge: async () => {
    throw CONFLICT;
  },
  mergeTask: async () => {
    throw CONFLICT;
  },
});

/**
 * Git subcommands that change a branch, a reference, an index or the files of a worktree: each one is a step of the
 * merge of a ticket that a stop can follow.
 */
const STEP_COMMANDS: ReadonlySet<string> = new Set(['commit-tree', 'reset', 'rebase', 'update-ref', 'merge']);

/**
 * Number of the git steps of the merge of a ticket whose commit is rebased onto the task branch: the squashed commit,
 * the move of the ticket branch to it, the rebase, the fork point after the rebase, the move of the task branch and
 * the fork point after the landing.
 */
const GIT_STEP_COUNT = 6;

/**
 * Message of the error of a git step after which a test stops the server.
 */
const STOPPED = 'The server stopped';

/**
 * Merge of a ticket of a test on real git and the real storage: a task with one ticket, whose ticket branch has two
 * commits, while the task branch has a commit that the ticket branch lacks.
 */
interface GitMerge {
  /**
   * Context of the methods, with a connected caller and `Worktrees` that run real git.
   */
  readonly context: MethodContext;

  /**
   * Stored task.
   */
  readonly task: Task;

  /**
   * Absolute path of the main checkout.
   */
  readonly checkout: string;

  /**
   * Name of the task branch.
   */
  readonly taskBranch: string;

  /**
   * Commit at the tip of the task branch before the merge.
   */
  readonly taskStart: string;

  /**
   * Makes the git step `step` of the next calls, counted from 1, reject with `STOPPED` once it ran, as a stop of the
   * server right after it.
   */
  stopAfter(step: number): void;
}

/**
 * Returns a `GitMerge` in a new repository that the end of the test `test` removes, whose ticket has the progress
 * `progress`, in progress by default.
 */
const gitMerge = async (test: TestContext, progress: TicketSpec = { status: 'in-progress' }): Promise<GitMerge> => {
  const checkout = await testGitRepository(test);
  let stop = 0;
  let steps = 0;
  const runGit: RunGitFunction = async (directory, commandLine, input) => {
    const output = await processRunGit(directory, commandLine, input);
    if (stop > 0 && commandLine.some((argument) => STEP_COMMANDS.has(argument))) {
      steps += 1;
      if (steps === stop) {
        stop = 0;
        throw new Error(STOPPED);
      }
    }
    return output;
  };
  const context = testMethodContext({
    caller: testConnection(),
    worktrees: testWorktrees(checkout, join(checkout, 'home'), runGit),
  });
  const task = await storedTask(context, { baseBranch: 'main', tickets: [progress] });
  const created = await context.worktrees.create(task, ticketOf(task), 'main');
  await testCommit(created.ticket.path, 'cache.txt', 'cache');
  await testCommit(created.ticket.path, 'store.txt', 'store');
  await testCommit(created.task.path, 'other.txt', 'other');
  return {
    context,
    task,
    checkout,
    taskBranch: created.task.branch,
    taskStart: await testGit(checkout, 'rev-parse', created.task.branch),
    stopAfter: (step) => {
      stop = step;
      steps = 0;
    },
  };
};

/**
 * Returns the first ticket of `task`, which must exist.
 */
const ticketOf = (task: Task): Ticket => {
  const [ticket] = task.tickets;
  assert.ok(ticket);
  return ticket;
};

/**
 * Checks that the task branch of `merge` holds exactly one commit since its start, the commit `commit` with the whole
 * work of the ticket and its trailer, and that the ticket is stored `needs-review` and free for another session.
 */
const assertLanded = async (merge: GitMerge, commit: string | null): Promise<void> => {
  const { checkout, context, task, taskBranch, taskStart } = merge;
  assert.equal(await testGit(checkout, 'rev-list', `${taskStart}..${taskBranch}`), commit);
  assert.equal(await testGit(checkout, 'show', '--name-only', '--format=', taskBranch), 'cache.txt\nstore.txt');
  assert.equal(
    await testGit(checkout, 'log', '-1', '--format=%(trailers:key=Atomic-Workflow-Ticket,valueonly)', taskBranch),
    '1-part-1-work',
  );
  assert.deepEqual(await progressOf(task.id, 1, context), { status: 'needs-review', stage: null, blockedReason: null });
  assert.equal(context.ticketClaims.isHeldByOther(task.id, 1, testConnection()), false);
};

/**
 * Returns a validation of `assert.rejects` that accepts an `RpcError` of the code `code` whose message fits `pattern`.
 */
const rpcError =
  (code: number, pattern: RegExp) =>
  (error: unknown): boolean =>
    error instanceof RpcError && error.code === code && pattern.test(error.message);

/**
 * Arguments of git that only the command lines of the steps of the merge of a task hold.
 */
const TASK_STEP_ARGUMENTS: ReadonlySet<string> = new Set([
  'update-ref',
  'switch',
  'rebase',
  'merge',
  'remove',
  'prune',
  '-D',
]);

/**
 * Returns whether the git command line `commandLine` is a step of the merge of a task that a stop can follow: it
 * changes a branch, a reference, a rebase, a worktree or the files of one.
 */
const isTaskStep = (commandLine: readonly string[]): boolean =>
  commandLine.some((argument) => TASK_STEP_ARGUMENTS.has(argument));

/**
 * Number of the git steps of the merge of a task whose task branch is rebased onto the base branch, with one ticket
 * branch left. The first call prunes the worktrees, records the tips, detaches the task worktree, rebases and records
 * the candidate. The call with the checks moves the task branch to the candidate, checks it out again, removes the
 * candidate, moves the base branch, removes both worktrees, prunes, and deletes each branch with its fork point and its
 * candidate.
 */
const TASK_GIT_STEP_COUNT = 18;

/**
 * Merge of a task of a test on real git and the real storage: a task with one done ticket, whose commit landed on the
 * task branch, while the base branch `main` has a commit that the task branch lacks.
 */
interface GitTaskMerge {
  /**
   * Context of the methods, with a connected caller and `Worktrees` that run real git.
   */
  readonly context: MethodContext;

  /**
   * Stored task.
   */
  readonly task: Task;

  /**
   * Absolute path of the main checkout.
   */
  readonly checkout: string;

  /**
   * Absolute path of the directory of the worktrees of the task.
   */
  readonly taskDirectory: string;

  /**
   * Commit at the tip of `main` before the merge of the task.
   */
  readonly baseStart: string;

  /**
   * Makes the git step `step` of the next calls, counted from 1, reject with `STOPPED` once it ran, as a stop of the
   * server right after it.
   */
  stopAfter(step: number): void;
}

/**
 * Returns a `GitTaskMerge` in a new repository that the end of the test `test` removes.
 */
const gitTaskMerge = async (test: TestContext): Promise<GitTaskMerge> => {
  const checkout = await testGitRepository(test);
  let stop = 0;
  let steps = 0;
  const runGit: RunGitFunction = async (directory, commandLine, input) => {
    const output = await processRunGit(directory, commandLine, input);
    if (stop > 0 && isTaskStep(commandLine)) {
      steps += 1;
      if (steps === stop) {
        stop = 0;
        throw new Error(STOPPED);
      }
    }
    return output;
  };
  const context = testMethodContext({
    caller: testConnection(),
    worktrees: testWorktrees(checkout, join(checkout, 'home'), runGit),
  });
  const task = await storedTask(context, { baseBranch: 'main', tickets: [{ status: 'in-progress' }] });
  const created = await context.worktrees.create(task, ticketOf(task), 'main');
  await testCommit(created.ticket.path, 'cache.txt', 'cache');
  await testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 1, message: MESSAGE }, context);
  await context.tasks.setTicketProgress(task.id, 1, { status: 'done', stage: null, blockedReason: null });
  await testCommit(checkout, 'base.txt', 'base');
  return {
    context,
    task,
    checkout,
    taskDirectory: dirname(created.task.path),
    baseStart: await testGit(checkout, 'rev-parse', 'main'),
    stopAfter: (step) => {
      stop = step;
      steps = 0;
    },
  };
};

/**
 * Number of the calls after which `mergeToEnd` gives up: a stop, a refusal `needs-checks`, a stop again, and the call
 * that ends.
 */
const MAX_TASK_MERGE_CALLS = 4;

/**
 * End of the merge of a task of a test.
 */
interface TaskMergeEnd {
  /**
   * Result of the call that ended the merge.
   */
  readonly merged: MergedTask;

  /**
   * Number of the calls that stopped on the way.
   */
  readonly stops: number;

  /**
   * Each tip that `main` had after a call, its tip before the merge included.
   */
  readonly baseTips: ReadonlySet<string>;
}

/**
 * Returns the result `result` of `worktreeMerge`, which must be the result of the merge of a task.
 */
const taskResult = (result: MergedTask | MergedTicket): MergedTask => {
  assert.ok('deleted' in result, 'The result is no merge of a task');
  return result;
};

/**
 * Returns the commit of the candidate of the refusal `needs-checks` that `error` is, or `undefined` for any other
 * error.
 */
const candidateOf = (error: unknown): string | undefined => {
  if (!(error instanceof RpcError) || typeof error.data !== 'object' || error.data === null) return undefined;
  if (!('kind' in error.data) || error.data.kind !== 'needs-checks') return undefined;
  return 'commit' in error.data && typeof error.data.commit === 'string' ? error.data.commit : undefined;
};

/**
 * Returns the end of the merge of the task of `merge`, after the stops that the calls meet: each call that stopped is
 * called again with the same parameters, and each refusal `needs-checks` is called again with checks that passed on
 * its candidate.
 */
const mergeToEnd = async (merge: GitTaskMerge): Promise<TaskMergeEnd> => {
  const baseTips = new Set([merge.baseStart]);
  let params: { taskId: number; checks?: RebaseChecks } = { taskId: merge.task.id };
  let stops = 0;
  for (let call = 1; call <= MAX_TASK_MERGE_CALLS; call += 1) {
    try {
      return { merged: taskResult(await testCall(worktreeMergeMethod, params, merge.context)), stops, baseTips };
    } catch (error) {
      const candidate = candidateOf(error);
      if (candidate !== undefined) params = { taskId: merge.task.id, checks: { commit: candidate, failure: null } };
      else if (error instanceof Error && error.message.includes(STOPPED)) stops += 1;
      else throw error;
    } finally {
      baseTips.add(await testGit(merge.checkout, 'rev-parse', 'main'));
    }
  }
  assert.fail(`The merge of the task did not end in ${MAX_TASK_MERGE_CALLS} calls`);
};

/**
 * Checks that `main` of `merge` holds the commit of the ticket exactly once since its start, as the commit `commit`,
 * that no worktree and no branch of the task is left, and that the task is stored `done`.
 */
const assertTaskLanded = async (merge: GitTaskMerge, commit: string | null): Promise<void> => {
  const { checkout, context, task, baseStart } = merge;
  assert.equal(await testGit(checkout, 'log', '--format=%s', `${baseStart}..main`), MESSAGE);
  assert.equal(commit, await testGit(checkout, 'rev-parse', 'main'));
  assert.equal(await testGit(checkout, 'branch', '--list', 'atomic-workflow/*'), '');
  assert.equal((await testGit(checkout, 'worktree', 'list', '--porcelain')).match(/^worktree /gm)?.length, 1);
  assert.equal(await testPathExists(merge.taskDirectory), false);
  assert.equal((await taskOf(task.id, context)).status, 'done');
};

describe('worktreeMerge', { concurrency: true }, () => {
  it('returns the task branch, the commit and the ticket set needs-review', async () => {
    const context = testMethodContext({ worktrees: mergingWorktrees([]) });
    const task = await storedTask(context);
    const result = await testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 1, message: MESSAGE }, context);
    assert.deepEqual(result, {
      ...MERGED_TICKET,
      ticket: { ...task.tickets[0], status: 'needs-review', stage: null, blockedReason: null },
    });
  });

  it('stores the ticket needs-review', async () => {
    const context = testMethodContext({ worktrees: mergingWorktrees([]) });
    const task = await storedTask(context);
    await testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 1, message: MESSAGE }, context);
    assert.deepEqual(await progressOf(task.id, 1, context), {
      status: 'needs-review',
      stage: null,
      blockedReason: null,
    });
  });

  it('passes the task, the ticket and the trimmed message to the worktrees', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: mergingWorktrees(calls) });
    const task = await storedTask(context);
    const message = `  ${MESSAGE}\n\nAdd a cache in front of the answers.\n`;
    await testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 1, message }, context);
    assert.deepEqual(calls, [['merge', task.id, 1, `${MESSAGE}\n\nAdd a cache in front of the answers.`]]);
  });

  it('merges a blocked ticket', async () => {
    const context = testMethodContext({ worktrees: mergingWorktrees([]) });
    const task = await storedTask(context, {
      tickets: [{ status: 'blocked', stage: 'tests', blockedReason: 'Waits' }],
    });
    await testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 1, message: MESSAGE }, context);
    assert.deepEqual(await progressOf(task.id, 1, context), {
      status: 'needs-review',
      stage: null,
      blockedReason: null,
    });
  });

  it('releases the claim of the caller after the merge of the ticket', async () => {
    const caller = testConnection();
    const context = testMethodContext({ caller, worktrees: mergingWorktrees([]) });
    const task = await storedTask(context);
    context.ticketClaims.claim(task.id, 1, caller);
    await testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 1, message: MESSAGE }, context);
    assert.equal(context.ticketClaims.isHeldByOther(task.id, 1, testConnection()), false);
  });

  it('rejects a ticket without a message with invalid parameters', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: mergingWorktrees(calls) });
    const task = await storedTask(context);
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 1 }, context),
      rpcError(RPC_ERROR_CODES.INVALID_PARAMS, /The merge of a ticket needs a message/),
    );
    assert.deepEqual(calls, []);
  });

  it('rejects a message that does not start with a summary line with invalid parameters', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: mergingWorktrees(calls) });
    const task = await storedTask(context);
    for (const message of ['Add the cache layer', 'feature: add the cache layer', 'feat:add the cache layer']) {
      await assert.rejects(
        testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 1, message }, context),
        rpcError(RPC_ERROR_CODES.INVALID_PARAMS, /Must start with a summary line/),
      );
    }
    assert.deepEqual(calls, []);
  });

  it('accepts a summary line with a scope and a breaking change mark', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: mergingWorktrees(calls) });
    const task = await storedTask(context);
    await testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 1, message: 'fix(cache)!: drop it' }, context);
    assert.deepEqual(calls, [['merge', task.id, 1, 'fix(cache)!: drop it']]);
  });

  it('rejects a ticket that is not in progress or blocked, and has no landed commit, with an invalid request', async () => {
    for (const status of ['not-started', 'needs-review', 'done'] as const) {
      const calls: unknown[][] = [];
      const context = testMethodContext({ worktrees: mergingWorktrees(calls) });
      const task = await storedTask(context, { tickets: [{ status }] });
      await assert.rejects(
        testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 1, message: MESSAGE }, context),
        rpcError(
          RPC_ERROR_CODES.INVALID_REQUEST,
          new RegExp(`Ticket 1 is ${status}, and only a ticket in progress or blocked can merge`),
        ),
      );
      assert.deepEqual(calls, []);
    }
  });

  it('rejects a ticket that another session holds with an invalid request', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ caller: testConnection(), worktrees: mergingWorktrees(calls) });
    const task = await storedTask(context);
    context.ticketClaims.claim(task.id, 1, testConnection());
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 1, message: MESSAGE }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /Ticket 1 of task \d+ is in progress in another session/),
    );
    assert.deepEqual(calls, []);
  });

  it('rejects the merge of a ticket of a task whose plan is not complete with an invalid request', async () => {
    const context = testMethodContext({ worktrees: mergingWorktrees([]) });
    const task = await storedTask(context, { status: 'plan-tickets' });
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 1, message: MESSAGE }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /The plan of task \d+ is not complete/),
    );
  });

  it('rejects the merge of a ticket of a task that does not exist with invalid parameters', async () => {
    const context = testMethodContext({ worktrees: mergingWorktrees([]) });
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: 9, ticketId: 1, message: MESSAGE }, context),
      rpcError(RPC_ERROR_CODES.INVALID_PARAMS, /No task 9 exists/),
    );
  });

  it('rejects a ticket that does not exist with invalid parameters', async () => {
    const context = testMethodContext({ worktrees: mergingWorktrees([]) });
    const task = await storedTask(context);
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 2, message: MESSAGE }, context),
      rpcError(RPC_ERROR_CODES.INVALID_PARAMS, /has no ticket 2/),
    );
  });

  it('rejects a refusal of git with an invalid request that holds its kind and its files', async () => {
    const context = testMethodContext({ worktrees: refusingWorktrees() });
    const task = await storedTask(context);
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 1, message: MESSAGE }, context),
      (error) => {
        assert.ok(error instanceof RpcError);
        assert.deepEqual(
          { code: error.code, message: error.message, data: error.data },
          {
            code: RPC_ERROR_CODES.INVALID_REQUEST,
            message: CONFLICT.message,
            data: { kind: 'conflict', files: ['src/cache.ts'] },
          },
        );
        return true;
      },
    );
  });

  it('keeps the claim and the progress of the ticket for a connected caller when the merge fails', async () => {
    const context = testMethodContext({ caller: testConnection(), worktrees: refusingWorktrees() });
    const task = await storedTask(context);
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 1, message: MESSAGE }, context),
      RpcError,
    );
    assert.equal(context.ticketClaims.isHeldByOther(task.id, 1, testConnection()), true);
    assert.deepEqual(await progressOf(task.id, 1, context), {
      status: 'in-progress',
      stage: 'prototype',
      blockedReason: null,
    });
  });

  it('releases the claim of the ticket for a caller without a connection when the merge fails', async () => {
    const context = testMethodContext({ worktrees: refusingWorktrees() });
    const task = await storedTask(context);
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 1, message: MESSAGE }, context),
      RpcError,
    );
    assert.equal(context.ticketClaims.isHeldByOther(task.id, 1, testConnection()), false);
  });

  for (let step = 1; step <= GIT_STEP_COUNT; step += 1) {
    it(`lands the ticket once when called again after a stop after git step ${step} of its merge`, async (test) => {
      const merge = await gitMerge(test);
      const params = { taskId: merge.task.id, ticketId: 1, message: MESSAGE };
      merge.stopAfter(step);
      await assert.rejects(testCall(worktreeMergeMethod, params, merge.context), new RegExp(STOPPED));
      const { commit } = await testCall(worktreeMergeMethod, params, merge.context);
      await assertLanded(merge, commit);
    });
  }

  it('lands the ticket once when called again after the storage failed to store it needs-review', async (test) => {
    const merge = await gitMerge(test);
    const { tasks } = merge.context;
    const setTicketProgress = tasks.setTicketProgress.bind(tasks);
    let failures = 1;
    tasks.setTicketProgress = async (taskId, ticketId, progress) => {
      failures -= 1;
      if (failures === 0) throw new Error('The storage failed');
      return setTicketProgress(taskId, ticketId, progress);
    };
    const params = { taskId: merge.task.id, ticketId: 1, message: MESSAGE };
    await assert.rejects(testCall(worktreeMergeMethod, params, merge.context), /The storage failed/);
    const landed = await testGit(merge.checkout, 'rev-parse', merge.taskBranch);
    const { commit } = await testCall(worktreeMergeMethod, params, merge.context);
    assert.equal(commit, landed);
    await assertLanded(merge, commit);
  });

  for (const status of ['in-progress', 'blocked'] as const) {
    it(`finishes the merge of a ticket ${status} whose commit is on the task branch without a move`, async (test) => {
      const merge = await gitMerge(test, { status, blockedReason: status === 'blocked' ? 'Waits' : null });
      const landed = await merge.context.worktrees.merge(merge.task, ticketOf(merge.task), MESSAGE);
      const params = { taskId: merge.task.id, ticketId: 1, message: MESSAGE };
      const result = await testCall(worktreeMergeMethod, params, merge.context);
      assert.deepEqual(result, {
        ...landed,
        ticket: { ...ticketOf(merge.task), status: 'needs-review', stage: null, blockedReason: null },
      });
      assert.equal(await testGit(merge.checkout, 'rev-parse', merge.taskBranch), landed.commit);
      await assertLanded(merge, result.commit);
    });
  }

  it('returns the result of the first call again for a ticket that needs review without a move', async (test) => {
    const merge = await gitMerge(test);
    const params = { taskId: merge.task.id, ticketId: 1, message: MESSAGE };
    const first = await testCall(worktreeMergeMethod, params, merge.context);
    const tip = await testGit(merge.checkout, 'rev-parse', merge.taskBranch);
    assert.deepEqual(await testCall(worktreeMergeMethod, params, merge.context), first);
    assert.equal(await testGit(merge.checkout, 'rev-parse', merge.taskBranch), tip);
  });

  it('returns the merged task with the task set done without a ticket', async () => {
    const context = testMethodContext({ worktrees: mergingWorktrees([]) });
    const task = await storedTask(context, { baseBranch: 'main', tickets: [{ status: 'done' }, { status: 'done' }] });
    const result = await testCall(worktreeMergeMethod, { taskId: task.id }, context);
    assert.deepEqual(result, { ...MERGED_TASK, task: { ...task, status: 'done' } });
  });

  it('stores the task done after the merge of the task', async () => {
    const context = testMethodContext({ worktrees: mergingWorktrees([]) });
    const task = await storedTask(context, { baseBranch: 'main', tickets: [{ status: 'done' }] });
    await testCall(worktreeMergeMethod, { taskId: task.id }, context);
    assert.equal((await taskOf(task.id, context)).status, 'done');
  });

  it('passes the task and its base branch to the worktrees without a ticket', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: mergingWorktrees(calls) });
    const task = await storedTask(context, { baseBranch: 'develop', tickets: [{ status: 'done' }] });
    await testCall(worktreeMergeMethod, { taskId: task.id }, context);
    assert.deepEqual(calls, [['mergeTask', task.id, 'develop']]);
  });

  it('releases the claims of every ticket after the merge of the task', async () => {
    const context = testMethodContext({ caller: testConnection(), worktrees: mergingWorktrees([]) });
    const task = await storedTask(context, { baseBranch: 'main', tickets: [{ status: 'done' }, { status: 'done' }] });
    await testCall(worktreeMergeMethod, { taskId: task.id }, context);
    const other = testConnection();
    assert.deepEqual(
      [1, 2].map((ticketId) => context.ticketClaims.isHeldByOther(task.id, ticketId, other)),
      [false, false],
    );
  });

  it('rejects a message without a ticket with invalid parameters', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: mergingWorktrees(calls) });
    const task = await storedTask(context, { baseBranch: 'main', tickets: [{ status: 'done' }] });
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: task.id, message: MESSAGE }, context),
      rpcError(RPC_ERROR_CODES.INVALID_PARAMS, /Only the merge of a ticket takes a message/),
    );
    assert.deepEqual(calls, []);
  });

  it('rejects the merge of a task with a ticket that is not done with an invalid request', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: mergingWorktrees(calls) });
    const task = await storedTask(context, {
      baseBranch: 'main',
      tickets: [{ status: 'done' }, { status: 'needs-review' }, { status: 'not-started' }],
    });
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: task.id }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /Tickets 2, 3 of task \d+ are not done/),
    );
    assert.deepEqual(calls, []);
    assert.equal((await taskOf(task.id, context)).status, 'complete');
  });

  it('rejects the merge of a task without a base branch with an invalid request', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: mergingWorktrees(calls) });
    const task = await storedTask(context, { tickets: [{ status: 'done' }] });
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: task.id }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /has no base branch/),
    );
    assert.deepEqual(calls, []);
  });

  it('rejects the merge of a task whose plan is not complete with an invalid request', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: mergingWorktrees(calls) });
    const task = await storedTask(context, { status: 'plan-tickets', baseBranch: 'main', tickets: [{}] });
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: task.id }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /The plan of task \d+ is not complete/),
    );
    assert.deepEqual(calls, []);
  });

  it('returns the landing of a task that is done with nothing deleted and no merge', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: landedWorktrees(calls, 'def5678') });
    const task = await storedTask(context, { status: 'done', baseBranch: 'main', tickets: [{ status: 'done' }] });
    const result = await testCall(worktreeMergeMethod, { taskId: task.id, checks: PASSED }, context);
    assert.deepEqual(result, { baseBranch: 'main', commit: 'def5678', deleted: NOTHING_DELETED, task });
    assert.deepEqual(calls, [['taskLanding', task.id, 'main']]);
  });

  it('returns a null commit for a task that is done whose landing cannot be found any more', async () => {
    const context = testMethodContext({ worktrees: landedWorktrees([], undefined) });
    const task = await storedTask(context, { status: 'done', baseBranch: 'main', tickets: [{ status: 'done' }] });
    const result = await testCall(worktreeMergeMethod, { taskId: task.id }, context);
    assert.deepEqual(result, { baseBranch: 'main', commit: null, deleted: NOTHING_DELETED, task });
  });

  it('rejects the merge of a task that is done without a base branch with an invalid request', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: landedWorktrees(calls, 'def5678') });
    const task = await storedTask(context, { status: 'done', tickets: [{ status: 'done' }] });
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: task.id }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /has no base branch/),
    );
    assert.deepEqual(calls, []);
  });

  for (let step = 1; step <= TASK_GIT_STEP_COUNT; step += 1) {
    it(`lands the task once when called again after a stop after git step ${step} of its merge`, async (test) => {
      const merge = await gitTaskMerge(test);
      merge.stopAfter(step);
      const { merged, stops, baseTips } = await mergeToEnd(merge);
      assert.equal(stops, 1);
      assert.equal(baseTips.size, 2);
      await assertTaskLanded(merge, merged.commit);
    });
  }

  it(`lands the task in ${TASK_GIT_STEP_COUNT} git steps`, async (test) => {
    const merge = await gitTaskMerge(test);
    merge.stopAfter(TASK_GIT_STEP_COUNT + 1);
    const { merged, stops } = await mergeToEnd(merge);
    assert.equal(stops, 0);
    await assertTaskLanded(merge, merged.commit);
  });

  it('lands the task once when called again after the storage failed to store it done', async (test) => {
    const merge = await gitTaskMerge(test);
    const { tasks } = merge.context;
    const setStatus = tasks.setStatus.bind(tasks);
    let failures = 1;
    tasks.setStatus = async (taskId, status) => {
      failures -= 1;
      if (failures === 0) throw new Error(STOPPED);
      return setStatus(taskId, status);
    };
    const { merged, stops, baseTips } = await mergeToEnd(merge);
    assert.equal(stops, 1);
    assert.equal(baseTips.size, 2);
    await assertTaskLanded(merge, merged.commit);
  });

  it('finishes the merge of a task whose task branch is gone and whose commits the base branch holds', async (test) => {
    const merge = await gitTaskMerge(test);
    const { checkout, context, task } = merge;
    const { commit } = await testCandidate(context.worktrees.mergeTask(task, 'main'));
    const landed = await context.worktrees.mergeTask(task, 'main', { commit, failure: null });
    const result = await testCall(worktreeMergeMethod, { taskId: task.id }, context);
    assert.deepEqual(result, {
      baseBranch: 'main',
      commit: landed.commit,
      deleted: NOTHING_DELETED,
      task: await taskOf(task.id, context),
    });
    assert.equal(await testGit(checkout, 'rev-parse', 'main'), landed.commit);
    await assertTaskLanded(merge, result.commit);
  });

  it('returns the result of the first call again for a task that is done without a move', async (test) => {
    const merge = await gitTaskMerge(test);
    const { merged } = await mergeToEnd(merge);
    const again = taskResult(await testCall(worktreeMergeMethod, { taskId: merge.task.id }, merge.context));
    assert.deepEqual(
      { baseBranch: again.baseBranch, commit: again.commit, deleted: again.deleted },
      { baseBranch: 'main', commit: merged.commit, deleted: NOTHING_DELETED },
    );
    await assertTaskLanded(merge, again.commit);
  });

  it('rejects the merge of a task with a ticket that another session holds with an invalid request', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: mergingWorktrees(calls) });
    const task = await storedTask(context, { baseBranch: 'main', tickets: [{ status: 'done' }, { status: 'done' }] });
    context.ticketClaims.claim(task.id, 2, testConnection());
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: task.id }, context),
      rpcError(RPC_ERROR_CODES.INVALID_REQUEST, /Ticket 2 of task \d+ is in progress in another session/),
    );
    assert.deepEqual(calls, []);
  });

  it('rejects the merge of a task that does not exist with invalid parameters', async () => {
    const context = testMethodContext({ worktrees: mergingWorktrees([]) });
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: 9 }, context),
      rpcError(RPC_ERROR_CODES.INVALID_PARAMS, /No task 9 exists/),
    );
  });

  it('rejects a refusal of git for the task with an invalid request and keeps the task complete', async () => {
    const context = testMethodContext({ worktrees: refusingWorktrees() });
    const task = await storedTask(context, { baseBranch: 'main', tickets: [{ status: 'done' }] });
    await assert.rejects(testCall(worktreeMergeMethod, { taskId: task.id }, context), (error) => {
      assert.ok(error instanceof RpcError);
      assert.deepEqual(
        { code: error.code, data: error.data },
        { code: RPC_ERROR_CODES.INVALID_REQUEST, data: { kind: 'conflict', files: ['src/cache.ts'] } },
      );
      return true;
    });
    assert.equal((await taskOf(task.id, context)).status, 'complete');
  });

  it('passes the checks of a candidate to the worktrees without a ticket', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: mergingWorktrees(calls) });
    const task = await storedTask(context, { baseBranch: 'main', tickets: [{ status: 'done' }] });
    await testCall(worktreeMergeMethod, { taskId: task.id, checks: PASSED }, context);
    assert.deepEqual(calls, [['mergeTask', task.id, 'main', PASSED]]);
  });

  it('rejects checks with a ticket with invalid parameters', async () => {
    const calls: unknown[][] = [];
    const context = testMethodContext({ worktrees: mergingWorktrees(calls) });
    const task = await storedTask(context);
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: task.id, ticketId: 1, message: MESSAGE, checks: PASSED }, context),
      rpcError(RPC_ERROR_CODES.INVALID_PARAMS, /Only the merge of a task takes checks/),
    );
    assert.deepEqual(calls, []);
  });

  it('rejects a refusal needs-checks for the task with an invalid request that holds the candidate, and keeps the task complete', async () => {
    const worktrees: Worktrees = {
      ...NO_WORKTREES,
      mergeTask: async () => {
        throw NEEDS_CHECKS;
      },
    };
    const context = testMethodContext({ worktrees });
    const task = await storedTask(context, { baseBranch: 'main', tickets: [{ status: 'done' }] });
    await assert.rejects(testCall(worktreeMergeMethod, { taskId: task.id }, context), (error) => {
      assert.ok(error instanceof RpcError);
      assert.deepEqual(
        { code: error.code, data: error.data },
        { code: RPC_ERROR_CODES.INVALID_REQUEST, data: { kind: 'needs-checks', files: [], ...CANDIDATE } },
      );
      return true;
    });
    assert.equal((await taskOf(task.id, context)).status, 'complete');
  });

  it('rejects checks that name no candidate for the task with invalid parameters', async () => {
    const worktrees: Worktrees = {
      ...NO_WORKTREES,
      mergeTask: async () => {
        throw new WorktreeError('invalid-checks', 'The commit is no candidate of the task branch');
      },
    };
    const context = testMethodContext({ worktrees });
    const task = await storedTask(context, { baseBranch: 'main', tickets: [{ status: 'done' }] });
    await assert.rejects(
      testCall(worktreeMergeMethod, { taskId: task.id, checks: PASSED }, context),
      rpcError(RPC_ERROR_CODES.INVALID_PARAMS, /is no candidate/),
    );
  });
});
