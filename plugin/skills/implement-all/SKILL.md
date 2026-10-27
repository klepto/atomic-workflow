---
name: implement-all
description: Implements every ticket of a task whose plan is complete that an agent can do alone, with the ready tickets in parallel subagents, and lands each one on the task branch as one commit, in the order of their ids.
argument-hint: "<task id | task slug>"
allowed-tools: Agent, mcp__plugin_atomic-workflow_atomic-workflow__activate, mcp__plugin_atomic-workflow_atomic-workflow__taskGet, mcp__plugin_atomic-workflow_atomic-workflow__ticketNext, mcp__plugin_atomic-workflow_atomic-workflow__worktreeCreate, mcp__plugin_atomic-workflow_atomic-workflow__worktreeMerge, mcp__plugin_atomic-workflow_atomic-workflow__worktreeDelete, mcp__plugin_atomic-workflow_atomic-workflow__ticketSetStatus, mcp__plugin_atomic-workflow_atomic-workflow__subagentCreate, Bash, PowerShell, Read, Edit, Grep, Glob
---

# Implement all

Implement every ticket of a task in the mode `unattended`, in waves. Each wave runs the ready tickets at once, each in
a subagent, then lands their work on the task branch in the order of their ids. Do the work of no ticket in this
conversation: the subagents do it, and this conversation lands it.

Before anything else, read `../../references/implementation.md` and `../implement/SKILL.md`, relative to the base
directory of this skill. Each subagent runs `implement`, and this conversation lands each ticket as its `## Land` says.

Arguments: `$ARGUMENTS`. The first word names the task, by its id, its slug, or both as `<id>-<slug>`. Without a task,
ask for it.

The subagents share the connection of this session to the atomic-workflow server. So this session holds the claim of
each ticket that a subagent starts, and can land it.

## Start

1. Activate as `../../references/activate.md` says, relative to the base directory of this skill.
2. Call `taskGet` with the first word. If it fails, print its message, and stop. If the status of the task is `done`,
   tell the user that the task is done already, and stop. If it is not `complete`, tell the user to complete its plan
   with `/atomic-workflow:plan` first, and stop.
3. Print the web URL, as `activate.md` says.

## Wave

1. Call `ticketNext` with the task id. If it fails, print its message, and stop.
2. Take the tickets of `pickable` in the mode `unattended`, in the order of their ids, at most 4. They are the tickets
   of the wave. More subagents at once would run more builds and tests at once, and make more conflicts at landing.
   The other tickets of `pickable` wait for the next wave. Leave out each ticket that ran in an earlier wave of this
   run, so that no ticket runs twice.
3. If the wave has no ticket, go on to `## Finish`.
4. Print `Wave <n>: tickets <id>-<slug>, <id>-<slug>, ...`, with the waves counted from 1.
5. Call `worktreeCreate` for each ticket of the wave, one at a time, in the order of their ids, before any subagent
   starts. Before it makes the branch of a ticket, it rebases the task branch onto the base branch, so this
   conversation resolves each conflict of that rebase, and the subagents find their worktrees made:
   - On a failure with the kind `conflict`, resolve it as `## Sync conflict` of `implement` says, then go on with the
     next ticket. If the conflict cannot be resolved, tell the user as it says, and stop the run, since no ticket can
     land while the rebase of the task branch stays stopped.
   - On any other failure, call `ticketSetStatus` with `blocked` and the message of the failure as `reason`, and leave
     the ticket out of the wave. If the call fails, remember its message.
   - Remember for each ticket what `worktreeCreate` warns of: the uncommitted changes when `uncommittedChanges` is
     true, each file of `copyFailures`, and each line of `warnings`.

   If no ticket of the wave is left, start the next wave at step 1.
6. Call `subagentCreate` with the task id once for each ticket of the wave, one at a time, in the order of their ids,
   and remember the `sessionId` that it returns for the ticket. So the chat of each subagent shows under the task in
   the web app. If a call fails, print its message, and stop the run, since no subagent of the wave has started yet.
7. Start one subagent for each ticket of the wave with the Agent tool, all in one message, so that they run in
   parallel. Use the `subagent_type` `general-purpose`, since it has every tool that the work needs: Skill, the tools
   of the MCP server `atomic-workflow`, Bash, Read, Edit and Write. Do not set `run_in_background`. Use the
   description `Implement ticket <ticket id>-<ticket slug>`, and exactly this prompt, with the session id of the
   ticket on its first line:

   ```
   Your session id is <session id>.
   Invoke the skill `atomic-workflow:implement` with the Skill tool and the arguments `<task id> <ticket id> --no-land`.
   Follow it to its end. Make the report that ends it your final reply, word for word.
   ```

8. Once every subagent of the wave has ended, follow `## Land the wave`.
9. Start the next wave at step 1.

A ticket in the mode `attended` or `manual` runs in no wave, since it needs the user. The waves still run every
ticket in the mode `unattended` that does not depend on it, since the user is not needed for those. Only the tickets
that depend on it wait for the user.

## Land the wave

Take the final reply of each subagent of the wave, in the order of the ids of their tickets:

- `Ready to land`: land the ticket as steps 2 to 4 of `## Land` of `implement` say, with the commit message and the
  worktree of the report. Resolve a conflict in that worktree, as step 3 says. If a conflict cannot be resolved
  without changing the intent of a ticket, or `worktreeMerge` fails for another cause, call `ticketSetStatus` with
  `blocked` and the cause in one sentence as `reason`. Then go on with the next ticket. Remember the commit of each
  ticket that landed, the summary line of its message, and the `Decisions:` of its report.
- `Blocked`: the subagent blocked the ticket already. Go on with the next ticket.
- Any other reply, `Stopped` included: call `ticketSetStatus` with `blocked` and the cause that the reply names as
  `reason`, or `Its subagent ended without a report.` when it names none. So the ticket runs in no later wave, and
  waits for the user. If the call fails, remember its message.

A blocked ticket stops only the tickets that depend on it. Every other ticket of the wave still lands.

## Finish

Use the result of the last call of `ticketNext`. Print this report, and leave out each section without a line:

```
Task **<task id>-<task slug>**. Waves: <number of waves>.
Landed:
- **<id>-<slug>**: <first 7 characters of the commit> <summary line>
  - Decision: <decision>
  - <warning>
Blocked:
- **<id>-<slug>**: <blockedReason>
Waiting for the user:
- **<id>-<slug>** (<mode>): /atomic-workflow:implement <task id> <ticket id>
Waiting for dependencies:
- **<id>-<slug>**: waits for tickets <pendingDependencies, comma-separated>.
In progress in another session:
- **<id>-<slug>**
Next: <next step>
```

- `Landed`: each ticket that landed in this run, in the order in which it landed. For a ticket whose commit is null,
  print `changed nothing` in place of the commit and the summary line. Below the line of a ticket, name each line of
  the `Decisions:` of its report, so the review weighs it. Then name each warning of `worktreeCreate` that this
  conversation remembered, each line of the `Warnings:` of its report, and each warning of `worktreeDelete`.
- `Blocked`: each ticket of `waiting` with the cause `blocked`, then each ticket whose `ticketSetStatus` failed, with
  the message of the failure.
- `Waiting for the user`: each ticket of `pickable` in the mode `attended` or `manual`.
- `Waiting for dependencies`: each ticket of `waiting` with the cause `dependencies`.
- `In progress in another session`: each ticket of `waiting` with the cause `elsewhere`.

The next step is the first of these that applies:

1. `pickable` and `waiting` are both empty, so every ticket landed: `Next: once their review passes, approve them with
   /atomic-workflow:approve <task id>.`
2. A ticket waits for the user: `Next: /atomic-workflow:implement <task id> <id of the first ticket that waits for the
   user>, then /atomic-workflow:implement-all <task id> again.`
3. A ticket is blocked: `Next: once the cause of a blocked ticket is gone, resume it with /atomic-workflow:implement
   <task id> <ticket id>, then run /atomic-workflow:implement-all <task id> again.`
4. Else: `Next: once the other session lands its tickets, run /atomic-workflow:implement-all <task id> again.`
