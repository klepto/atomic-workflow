---
name: approve
description: Approves the reviewed work of one ticket of a task, or of every ticket whose work landed, and sets it done. Once every ticket of the task is done, lands the task branch on its base branch and sets the task done.
argument-hint: "<task id | task slug> [ticket id | ticket slug]"
allowed-tools: mcp__plugin_atomic-workflow_atomic-workflow__activate, mcp__plugin_atomic-workflow_atomic-workflow__taskGet, mcp__plugin_atomic-workflow_atomic-workflow__ticketSetStatus, mcp__plugin_atomic-workflow_atomic-workflow__worktreeMerge, Bash, PowerShell, Read, Edit, Grep, Glob
---

# Approve

Approve tickets whose work landed on the task branch and passed its review. Once every ticket of the task is approved,
land the task branch on the base branch of the task.

Arguments: `$ARGUMENTS`. The first word names the task, the optional second word the ticket: each by its id, its slug,
or both as `<id>-<slug>`. Without a ticket, approve every ticket of the task that the server accepts. Without a task,
ask for it.

A follow-up ticket fixes a ticket whose review found a problem: its `fixes` is the id of that ticket. The server
approves a ticket only once each of its follow-up tickets has landed, with the status `needs-review` or `done`.

## Reject

A ticket whose work landed is never reopened. When the user wants to reject a ticket, approve nothing, and tell them:
"To reject ticket <id>-<slug>, run `/atomic-workflow:plan-tickets <task id>` and ask for a follow-up ticket that
fixes it, with the problem that the review found. Once the follow-up ticket lands, approve both." Then stop.

## Approve the tickets

1. Activate as `../../references/activate.md` says, relative to the base directory of this skill.
2. Call `taskGet` with the first word. If it fails, print its message, and stop. If the status of the task is `done`,
   tell the user that the task is done already, and stop. If it is not `complete`, tell the user to complete its plan
   with `/atomic-workflow:plan` first, and stop.
3. With a ticket, find it among the tickets of the task, by its id or its slug.
   - If its status is `done`, it is approved already. Go on to the next section.
   - If its status is not `needs-review`, its work has not landed. Tell the user to land it with
     `/atomic-workflow:implement <task id> <ticket id>` first, and stop.
   - If a follow-up ticket of it, a ticket whose `fixes` is its id, is neither `needs-review` nor `done`, its fix has
     not landed. Tell the user: "Ticket <id>-<slug> waits for its follow-up ticket
     <id>-<slug> (<status>). Land it with `/atomic-workflow:implement <task id> <follow-up id>` first." Then stop.
   - Else call `ticketSetStatus` with the status `done`. If it fails, print its message, and stop.
4. Without a ticket, call `ticketSetStatus` with the status `done` for each ticket whose status is `needs-review`, in
   the order of their ids. Leave every other ticket as it is. If the server refuses a ticket, such as one whose
   follow-up ticket has not landed, keep its message as the reason, and go on with the next ticket.

## Land the task

1. If a ticket of the task is not `done`, print `Approved: <id>-<slug>, ...` with each ticket that this call approved,
   or `Approved: none` when it approved none. Then print `Held back: <id>-<slug>: <reason>` on one line for each ticket
   that the server refused, if any. Then print `Tickets left before the task lands: <id>-<slug> (<status>), ...` with
   each ticket that is not `done`, and stop.
2. Call `worktreeMerge` with the task id alone. It rebases the task branch onto the base branch in the worktree of the
   task, moves the base branch forward to it, removes every worktree and branch of the task, and sets the task `done`.
3. On a conflict, the base branch changed since the task branch was made. Resolve the files that it names in the
   worktree that its message names, so that the changes of the base branch and the work of the task both stay. Run
   `git -C "<worktree>" add` on them, then call `worktreeMerge` again with the task id alone.
4. On any other refusal, such as changes of the main checkout that the move of the base branch would overwrite, print
   its message, and stop. A new `/atomic-workflow:approve` of the task lands it once the cause is gone.

## Finish

Print `Task **<id>-<slug>** landed on <base branch> at <first 7 characters of the commit>. Status: done.`, or
`Task **<id>-<slug>** changed nothing on <base branch>. Status: done.` when the commit is null. Then print the number
of worktrees and branches that the merge removed, and each of its warnings.
