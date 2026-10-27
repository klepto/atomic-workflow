# Implementation

The implementation of a task runs one ticket at a time, with `/atomic-workflow:implement <task> [ticket]`. Without a
ticket, it picks the next ready ticket of the task. `/atomic-workflow:implement-all <task>` implements every ticket in
the mode `unattended` instead, in waves. Each wave runs the ready tickets at once, each in a subagent that runs
`/atomic-workflow:implement <task> <ticket> --no-land`, then lands their work in the order of their ids. The
atomic-workflow server holds the task, its tickets and their progress; your memory of them does not count.

## Branches and worktrees

The task has a task branch, `atomic-workflow/<task id>-<task slug>/main`, which holds the work of each ticket that
landed. Each ticket works on a branch of its own, `atomic-workflow/<task id>-<task slug>/<ticket id>-<ticket slug>`,
made from the task branch. Each branch has its own worktree below `~/.atomic-workflow/worktrees/`, outside the main
checkout.

`worktreeCreate` makes both worktrees where they do not exist, and returns their paths. It is safe to call again: it
then only returns the paths, and keeps every commit.

Before it makes the branch of a ticket, `worktreeCreate` syncs the task branch with the local base branch: it rebases
the task branch onto the tip of the base branch in the worktree of the task. So a new ticket starts from both the
changes of the base branch and the tickets that landed. The commit of the task branch that the ticket starts from is
its fork point. When the ticket lands, `worktreeMerge` squashes the commits since the fork point into one commit, and
rebases it onto the tip of the task branch, so a sync after the ticket started does not bring the commits of other
tickets into it. A sync that stops on a conflict fails with the files, as `## Sync conflict` of `implement` says. The
sync is skipped, with a line in `warnings`, when the base branch does not exist, the worktree of the task has
uncommitted changes, or a ticket branch made before fork points were recorded still exists.

## Work in the worktree of the ticket

Your working directory is the main checkout. Never change a file there. All the work of the ticket happens in the
worktree of the ticket, the path `worktrees.ticket.path` of `worktreeCreate`:

- Read, Edit, Write, Grep and Glob take absolute paths below the worktree.
- Run each command with the worktree as its working directory: `cd "<worktree>" && <command>` in Bash, and
  `git -C "<worktree>" <arguments>` for git.
- Never push, and never commit in another worktree.

## Instructions of the repository

Read `AGENTS.md` and `CLAUDE.md` at the root of the worktree, and in each directory that the ticket touches, before
the first change. They win over the rules of the stages, for example on whether to write tests, and on how to check
a change.

## Scope

The description of the ticket says what to build: `## Acceptance criteria` the behavior that must hold, `## Contract`
the parts of the design that other tickets rely on, and `## Verify` the commands that check the work. How to build it
is yours to decide. `## Approach` is the guidance of the planner, written before anyone read the code in depth: a
starting point, never a limit. Do only the work of this ticket, with no feature beyond its acceptance criteria.

A later stage reads the work of an earlier one from `git -C "<worktree>" diff <task branch>...HEAD` and the messages of
the `wip` commits, not by reading every file again.

## Decisions

The stage `prototype` researches before it builds, and a ticket of the type `other` does so before its one pass.
Read the code that the ticket touches and what it leans on, and search the web for the facts the repository cannot
give: libraries, APIs, versions, known pitfalls. Research is done when each choice of the ticket rests on a fact you
checked, not on a guess.

Then take the best approach you can defend. Take an approach that differs from `## Approach` when it is clearly
better: more correct, simpler, less code, or a closer fit to the code beside it. A different taste is no reason.

A decision is a choice of yours that differs from `## Approach`, or that settles what the description leaves open and
a reviewer would ask about. Write each decision as one line: what you chose, over what, and why. Name the decisions of
a stage in the body of its `wip` commit, so that a later stage and the landing find them.

A contract binds you where other tickets rely on it:

- Match `## Contract` exactly: its names, signatures, data shapes and errors.
- Extend a contract when every existing part of it still holds, such as with a new optional field or a new export.
  Each extension is a decision.
- When a better approach needs a part of a contract to change or go, block the ticket, as `## Blocked` says, with the
  approach and what it gains. The user amends the design, which carries the change to every ticket that relies on it.

## Follow-up tickets

A follow-up ticket has `fixes`: the id of an earlier ticket whose work landed, and whose review found a problem. It
works like any other ticket. Its description names the problem, and its acceptance criteria say when the problem is
gone. Its work starts from the task branch, which holds the work of the ticket that it fixes. That ticket needs review,
which counts as landed, so the follow-up ticket can start. The ticket that it fixes is approved only once the
follow-up ticket lands.

## Stages

A ticket of the type `code` runs in stages, each a skill that you invoke with the Skill tool and the arguments
`<task id> <ticket id>`:

- `simple`: `atomic-workflow:implement-prototype`, then `atomic-workflow:implement-tests`.
- `complex`: `atomic-workflow:implement-prototype`, then `atomic-workflow:implement-tests`, then
  `atomic-workflow:implement-refactor`.

The tests lock the behavior of the prototype, and the refactor then reshapes the code while every test keeps passing.
No refactor follows the tests of a `simple` ticket, so its prototype has the final shape at once.

Each stage:

1. If this conversation has not called `worktreeCreate` for the ticket yet, calls it to learn the worktree.
2. Calls `ticketSetStatus` with `in-progress` and its stage, so that a later `/atomic-workflow:implement` resumes
   there.
3. Does its work, and runs the commands of `## Verify` that apply to it until they pass.
4. Commits its work in the worktree of the ticket: `git -C "<worktree>" add -A`, then a commit with the message
   `wip(<stage>): <what the stage did>`, and a body with one line `Decision: <decision>` for each decision of the
   stage. A stage that changed nothing commits nothing. The commits of the ticket become one at the end, so keep their
   messages short.
5. Ends its reply with one line: `Stage <stage> done. Next stage: <next stage skill>.` when the complexity of the
   ticket has a next stage, or `Stage <stage> done. Next: land the ticket.` after the last stage, which is `tests`
   for `simple` and `refactor` for `complex`.

## Final shape

The code of a ticket has its final shape when:

- Each part of `## Contract` that the ticket provides matches it exactly: names, signatures, data shapes, errors.
  Elsewhere, the public API follows the patterns of the code beside it.
- The code follows the instructions of the repository and the conventions of the code beside it: its structure, such
  as interfaces where the repository uses them, its naming, and its handling of errors.
- Each public declaration has documentation in the style of the repository.
- No dead code, debug output or leftover note of the prototype stays.
- No feature goes beyond the ticket.

## Blocked

Block the ticket when its work cannot go on without the user: a criterion that cannot hold, a command of `## Verify`
that still fails after three attempts at a fix, a question about what to build that the description does not answer,
a better approach that needs a contract to change, or a conflict that you cannot resolve without changing the intent
of a ticket. A question about how to build it is yours to decide, as `## Decisions` says. Call `ticketSetStatus` with
`blocked`, the current stage, and the cause in one sentence as `reason`. Then tell the user the cause and what you need, and stop. The next
`/atomic-workflow:implement <task id> <ticket id>` resumes at that stage. Without a ticket, `/atomic-workflow:implement`
never picks a blocked ticket, since it waits for the user.
