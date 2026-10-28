---
name: implement
description: Implements one ticket of a task whose plan is complete, the one named or else the next ready one, in a worktree of its own, and lands it on the task branch as one commit.
argument-hint: "<task id | task slug> [ticket id | ticket slug] [--no-land]"
allowed-tools: Skill, mcp__plugin_atomic-workflow_atomic-workflow__activate, mcp__plugin_atomic-workflow_atomic-workflow__taskGet, mcp__plugin_atomic-workflow_atomic-workflow__ticketNext, mcp__plugin_atomic-workflow_atomic-workflow__worktreeCreate, mcp__plugin_atomic-workflow_atomic-workflow__worktreeMerge, mcp__plugin_atomic-workflow_atomic-workflow__worktreeDelete, mcp__plugin_atomic-workflow_atomic-workflow__ticketSetStatus, Bash, PowerShell, Read, Edit, Write, Grep, Glob, WebSearch, WebFetch
---

# Implement

Do the work of one ticket in its own worktree, then land it on the task branch as one commit. Do no other ticket.

Before anything else, read `../../references/implementation.md`, relative to the base directory of this skill. It
holds the rules that every stage of the implementation shares: the worktrees, the scope, the stages and when to block.

Arguments: `$ARGUMENTS`. The first word names the task, the optional second word the ticket: each by its id, its slug,
or both as `<id>-<slug>`. Without a ticket, pick the next ready ticket of the task. Without a task, ask for it.

The optional third word `--no-land` stops the work after the check, as `## No land` says, and leaves the landing to
the caller. It needs a ticket.

## Start

1. Activate as `../../references/activate.md` says, relative to the base directory of this skill.
2. Call `taskGet` with the first word. If it fails, print its message, and stop. If the status of the task is `done`,
   tell the user that the task is done already, and stop. If it is not `complete`, tell the user to complete its plan
   with `/atomic-workflow:plan` first, and stop.
3. Without a ticket, follow `## Next ready ticket`. It picks a ticket, or stops. Go on with the picked ticket as if
   the user had named it.
4. Find the ticket among the tickets of the task, by its id or its slug. If its status is `needs-review` or `done`,
   tell the user that its work landed already, and that `/atomic-workflow:plan-tickets <task id>` adds a follow-up
   ticket to fix a problem in it. Then stop. If a ticket that it depends on is neither `needs-review` nor `done`, name
   those tickets, and stop. A follow-up ticket depends on the ticket that it fixes, which needs review, so it passes.
   With `--no-land`, a ticket in a mode other than `unattended` stops here too, as `## No land` says.
5. Call `worktreeCreate`. If it fails because another session works on the ticket, tell the user, and stop. If it
   fails with the kind `conflict`, follow `## Sync conflict`. If `taskBranchSynced` is true, say that the task branch
   now starts from the tip of `baseBranch`. If `uncommittedChanges` is true, warn the user that the changes of the
   main checkout that no commit holds are not on the task branch. If `copyFailures` is not null, name the files that
   were not copied. Name each line of `warnings`.

Start the first reply with the line of the picked ticket, if this call picked one. Then print the web URL, then the
path and the branch of the worktree of the ticket.

With `--no-land`, each stop of the start ends with the report of `## No land`.

## Sync conflict

Before `worktreeCreate` makes the branch of a ticket, it rebases the task branch onto the base branch, in the
worktree of the task. When that rebase stops on a conflict, the call fails with the files, and makes no branch for the
ticket:

1. Resolve each file that the error names in the worktree of the task, which the error names too, so that both the
   changes of the base branch and the work of the tickets that landed on the task branch stay.
2. Run `git -C "<worktree of the task>" add` on them.
3. Call `worktreeCreate` again. It continues the rebase, then makes the branch of the ticket. If it stops on a
   conflict again, with a later commit of the task branch, repeat from step 1.

If a conflict cannot be resolved without changing the intent of a ticket or of the changes of the base branch, tell
the user the files and the worktree of the task, and stop.

## Next ready ticket

The server picks the ticket, since only the server knows which tickets another session holds.

1. Call `ticketNext` with the task id. If it fails, print its message, and stop.
2. If `ticket` is not null, print `Next ready ticket: **<id>-<slug>**.` as the first line of the reply, and go on with
   that ticket. It is the first ticket in progress that no other session holds, else the first ticket not started,
   each with every dependency landed.
3. If `ticket` is null and `waiting` is empty, every ticket of the task landed. Print `Every ticket of task
   **<id>-<slug>** landed. Once their review passes, approve them with /atomic-workflow:approve <task id>.`, and stop.
4. Else print `No ticket of task **<id>-<slug>** is ready.`, then one line for each ticket of `waiting`, by its
   `cause`, and stop:
   - `elsewhere`: `**<id>-<slug>**: in progress in another session.`
   - `blocked`: `**<id>-<slug>**: blocked: <blockedReason> Once the cause is gone, resume it with
     /atomic-workflow:implement <task id> <ticket id>.`
   - `dependencies`: `**<id>-<slug>**: waits for tickets <pendingDependencies, comma-separated>.`

A blocked ticket is never picked: it waits for the user, and its reason says what for. The user names it once the
cause is gone.

## Work

Do the work by the mode and the type of the ticket. A follow-up ticket, with `fixes`, works like any other ticket, as
`implementation.md` says: its description names the problem to fix.

- Mode `manual`: the user does the work. Guide them through `## Steps` one step at a time, and check the result of
  each step before the next one, by reading files or running commands. Commit each change of the repository in the
  worktree of the ticket.
- Mode `attended`: the user takes part between turns, where the description says so. Ask them, and wait for their
  answer. Otherwise work as for `unattended`.
- Type `other`: research and decide as `## Decisions` of `implementation.md` says, then do the work in one pass, and
  commit it in the worktree of the ticket, with a line `Decision: <decision>` in the body for each decision.
- Type `code`: run the stages that `implementation.md` lists for the complexity of the ticket, in order, each with the
  Skill tool. If the ticket has a stage, start at that stage, and skip the ones before it. When a stage ends and names
  the next one, invoke it in the same reply. When it ends with `Next: land the ticket.`, go on to the check.

## Check

Before you land the ticket, check the whole work against its description:

1. Run each command of `## Verify` in the worktree of the ticket. Each must pass.
2. Read `git -C "<worktree>" diff <task branch>...HEAD`, and check each acceptance criterion against it. Name each
   criterion with the evidence that it holds.
3. Check each part of `## Contract` against the diff: the parts that the ticket provides match it exactly, and the
   parts that it uses are used as the contract says.
4. Collect the decisions of the ticket from the bodies of its commits, with
   `git -C "<worktree>" log --format=%b <task branch>..HEAD`.

Fix each gap, and commit the fix. If a gap stays, block the ticket.

With `--no-land`, go on to `## No land` instead of `## Land`.

## Land

1. Write the message of the one commit of the ticket. Its summary line is `<type>: <what changes>`, in the imperative
   and in lower case, at most 72 characters. The type is `feat` for a new ability, `fix` for a bug fix, `refactor` for
   a change of structure only, `docs` for documentation only, `test` for tests only, `perf` for speed, and `chore` for
   anything else. Below a blank line, the body says what changes and why, in one to three lines, then one line
   `Decision: <decision>` for each decision of the ticket.
2. Call `worktreeMerge` with the message. It squashes the commits of the ticket into one, rebases it onto the task
   branch, moves the task branch to it, and sets the ticket `needs-review`.
3. On a conflict, resolve the files that it names in the worktree of the ticket, so that the work of both tickets
   stays. Run `git -C "<worktree>" add` on them, then call `worktreeMerge` again with the same message.
4. Call `worktreeDelete` with the task id and the ticket id, without `force`. Read its result as
   `../../references/removal.md` says, relative to the base directory of this skill. The ticket landed already, so a
   block there only ends the reply with `## Finish`.

## Finish

Print `Ticket **<id>-<slug>** landed on <task branch> as <first 7 characters of the commit>. Status: needs-review.`,
or `Ticket **<id>-<slug>** changed nothing. Status: needs-review.` when the commit is null. Then name each decision
of the ticket, so the review weighs it, each process of `stoppedProcesses` of `worktreeDelete`, and each of its
warnings. For a follow-up ticket, add: `Once the review passes, approve ticket <fixes> and this ticket with
/atomic-workflow:approve <task id>.` End with the block of `removal.md`, if any.

## No land

With `--no-land`, no user takes part in the work, and the ticket does not land:

- Take only a ticket in the mode `unattended`. For any other mode, do not call `worktreeCreate`, and stop with the
  report below, with the cause `Ticket <id> is <mode>, so it needs the user.`
- Never ask the user. Where the work would need an answer from the user, block the ticket as `implementation.md`
  says.
- After the check, write the commit message as step 1 of `## Land` says. Do not call `worktreeMerge` or
  `worktreeDelete`.

End the final reply with exactly one of these reports, and nothing after it. When the check passed:

```
Ready to land: **<id>-<slug>**
Worktree: <worktrees.ticket.path>
Commit message:
<summary line>

<body>
Check:
- <acceptance criterion>: <evidence that it holds, in one line>
Decisions:
- <decision>
Warnings:
- <the uncommitted changes of `worktreeCreate`, each file that it did not copy, and each line of its `warnings`>
```

Leave out `Decisions:` and `Warnings:` when there are none. When the ticket is blocked:

```
Blocked: **<id>-<slug>**: <reason>
```

When the work stopped for any other cause, such as a failure of `worktreeCreate`:

```
Stopped: **<id>-<slug>**: <cause>
```
