---
name: run
description: Runs a task unattended to its end, from a prompt for a new task, any stage of planning or a complete plan, until every ticket that an agent can do alone landed. Asks the user nothing.
argument-hint: "<task id | task slug | prompt>"
allowed-tools: Skill, Agent, mcp__plugin_atomic-workflow_atomic-workflow__activate, mcp__plugin_atomic-workflow_atomic-workflow__taskGet, mcp__plugin_atomic-workflow_atomic-workflow__taskCreate, mcp__plugin_atomic-workflow_atomic-workflow__goalSave, mcp__plugin_atomic-workflow_atomic-workflow__goalDelete, mcp__plugin_atomic-workflow_atomic-workflow__designSave, mcp__plugin_atomic-workflow_atomic-workflow__ticketsSave, mcp__plugin_atomic-workflow_atomic-workflow__taskSetStatus, mcp__plugin_atomic-workflow_atomic-workflow__taskRunStart, mcp__plugin_atomic-workflow_atomic-workflow__taskRunEnd, mcp__plugin_atomic-workflow_atomic-workflow__ticketNext, mcp__plugin_atomic-workflow_atomic-workflow__worktreeCreate, mcp__plugin_atomic-workflow_atomic-workflow__worktreeMerge, mcp__plugin_atomic-workflow_atomic-workflow__worktreeDelete, mcp__plugin_atomic-workflow_atomic-workflow__ticketSetStatus, mcp__plugin_atomic-workflow_atomic-workflow__subagentCreate, Bash, PowerShell, Read, Edit, Grep, Glob, WebSearch, WebFetch
---

# Run

Drive a task from where it stands to its end, with no user: each remaining stage of planning in unattended mode, then
passes of `implement-all` until every ticket in the mode `unattended` landed. Each stage and each pass is a skill that
you invoke with the Skill tool. Do the work of no stage and no ticket in this conversation yourself.

Arguments: `$ARGUMENTS`. They name a task, by its id, its slug, or both as `<id>-<slug>`, or hold the prompt of a new
task. Without arguments, print `The run needs a task or a prompt.`, and stop.

The run asks the user nothing at any step. Each skill that it invokes runs without a user: the stages of planning in
unattended mode, and the tickets in subagents that block a ticket where they would ask. When a skill that the run
invokes ends and names a next step, such as a command for the user, ignore it: the run picks the next step itself.

If the user refuses a tool call, and the run cannot get past it, end the run with `## Report`, plus the line
`Refused: <message of the refusal>`.

## Start

1. Activate as `../../references/activate.md` says, relative to the base directory of this skill. If its result
   starts with `Started the atomic-workflow server.`, print the web URL.
2. Call `taskGet` with the first word. If it finds a task, the run drives that task. If it fails and the arguments are
   one word, print its message, and stop. If it fails and the arguments are several words, they are the prompt of a
   new task:
   1. Invoke the skill `atomic-workflow:plan-goals` with the arguments `--unattended <prompt>`. Let it run to its end.
      It creates the task with `taskCreate`, and stores its goals.
   2. If no call to `taskCreate` succeeded, print `Stopped: the stage plan-goals created no task.`, and stop.
   3. Call `taskGet` with the id that the result of `taskCreate` holds.
3. If the status of the task is `done`, print `Task **<id>-<slug>** is done already.`, and stop.
4. Call `taskRunStart` with the task id. It marks the start of the run, so the task panel of the web app shows how
   long the run has taken. If it fails, print its message, and go on: the run does not need it.

## Planning

While the status of the task is `plan-goals`, `plan-design` or `plan-tickets`:

1. Invoke the skill `atomic-workflow:<status>` with the arguments `<task id> --unattended`, such as
   `atomic-workflow:plan-design 5 --unattended`. Let it run to its end. Each stage sets the status of the next stage
   when it finishes, and `plan-tickets` sets `complete`.
2. Call `taskGet` with the task id.
3. If the status is the same as before the stage, the stage did not finish, and a second try would do the same. End
   the run with `## Report`, plus the line `Stopped: the stage <status> did not finish.`

Once the status is `complete`, go on to `## Passes`.

## Passes

Before the first pass, remember the tickets of the task whose status is `needs-review` or `done`. They landed before
the run.

1. Print `Pass <n>.`, with the passes counted from 1.
2. Invoke the skill `atomic-workflow:implement-all` with the argument `<task id>`. Let it run to its end, its waves and
   its landings included.
3. Call `taskGet` with the task id. Carry each decision `Contract change:` of a ticket that landed in this pass into
   the plan, as `## Contract changes` says.
4. If every ticket in the mode `unattended` is `needs-review` or `done`, go on to `## Report`.
5. If no ticket became `needs-review` or `done` in this pass, go on to `## Report`, since a further pass would do the
   same.
6. Else start the next pass at step 1.

`implement-all` starts a subagent for each ticket of a wave with the Agent tool. Inside a subagent, such as the
orchestrator of a task, the Agent tool runs each of them in the background, whatever `run_in_background` says, and a
notice tells you when each one ends. Land a wave only once the notice of every subagent of the wave came. While they
run and nothing else is left to do, end your turn: the notice of the next end wakes you, and the run goes on.

## Contract changes

A ticket in unattended mode changes a part of a contract when the change keeps what other tickets use, and names it
in a decision `Contract change: <section>: <new text>, over <old text>, because <reason>.`. The report of
`implement-all` lists the decisions of each ticket that landed. For each contract change, in the order of the tickets:

1. Rewrite the part in the section of the design that the decision names, and add the change to `## Decisions`, with
   the old text as the alternative. Store the design with `designSave`.
2. Rewrite the quote of that section in the `## Contract` of each ticket that is `not-started`. Store the tickets with
   `ticketsSave`, and pass each other ticket exactly as `taskGet` returns it, since its work started.

The task stays `complete`. Call `taskGet` again once the plan is stored.

## Report

Call `ticketNext` with the task id. Then, if step 4 of `## Start` called `taskRunStart`, call `taskRunEnd` with the
task id, as the last call before the report. It marks the end of the run, also when a line `Stopped:` or `Refused:`
ends it. Then print this report, and leave out each section without a line:

```
Run of task **<task id>-<task slug>**. Status: <status>. Passes: <number of passes>.
Landed:
- **<id>-<slug>**
Left:
- **<id>-<slug>** (<mode>, <status>): <reason>
Next: <next step>
```

- `Landed`: each ticket that is `needs-review` or `done` now, and was not before the first pass, in the order of their
  ids.
- `Left`: each ticket that is neither `needs-review` nor `done`, in the order of their ids, with the first reason that
  applies:
  1. Its mode is `attended` or `manual`: `needs the user: /atomic-workflow:implement <task id> <ticket id>`.
  2. It is `blocked`: `blocked: <blockedReason>`.
  3. It depends on a ticket that is left: `waits for tickets <ids of those tickets, comma-separated>`.
  4. It is in `waiting` of `ticketNext` with the cause `elsewhere`: `in progress in another session`.
  5. Else: `no pass landed it`.

The next step is the first of these that applies:

1. No ticket is left: `Next: once their review passes, approve them with /atomic-workflow:approve <task id>.`
2. The planning stopped: `Next: /atomic-workflow:plan <task id>.`
3. A ticket is left: `Next: settle the tickets that are left, then run the task again.`

A line `Refused:` or `Stopped:` that ended the run goes last, after `Next:`.
