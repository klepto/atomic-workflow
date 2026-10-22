---
name: tasks
description: Lists the tasks of the atomic workflow in this repository, or shows one task in detail with its tickets.
argument-hint: "[task id | task slug]"
allowed-tools: mcp__plugin_atomic-workflow_atomic-workflow__activate, mcp__plugin_atomic-workflow_atomic-workflow__taskList, mcp__plugin_atomic-workflow_atomic-workflow__taskGet, Bash(node:*)
---

# Tasks

Arguments: `$ARGUMENTS`. A first word names one task to show in detail: its id, its slug, or both as the list prints
them, such as `3-cache-layer-redis`. Without one, list every task.

Print each item as a paragraph, and separate two items with a blank line. Use no Markdown list. Print a creation time
in local time, as `YYYY-MM-DD HH:MM`. Print nothing else.

## List

1. Activate as `../../references/activate.md` says, relative to the base directory of this skill.
2. Call `taskList`.
3. Print each task as a paragraph. Without tasks, print `No tasks yet.`

Print a task with its `completedTickets` and its `totalTickets`:

```markdown
**3-cache-layer-redis**
Date: 2026-10-21 18:21
Status: plan-design
Tickets: <completedTickets>/<totalTickets>
```

## Detail

1. Activate as `../../references/activate.md` says, relative to the base directory of this skill.
2. Call `taskGet` with the first word. If it fails, print its message, and stop.
3. Print the task as a paragraph, as the list prints it. Count as done each ticket with the status `needs-review` or
   `done`, and count every ticket in the total. Add the line `Base branch: <baseBranch>` when `baseBranch` is not
   `null`.
4. Print each ticket as a paragraph, in the order of the result. Without tickets, print `No tickets yet.`

Print a ticket with its mode, its type and its complexity, the last one only when it is not `null`. Add the stage
after the status when `stage` is not `null`. Add the line `After <ids>.` with the ids of `dependsOn` when it is not
empty. Add the line `Fixes <fixes>.` when `fixes` is not `null`. Add the line `Blocked: <blockedReason>` when the
status is `blocked`:

```markdown
**3-cache-layer-redis**
Date: 2026-10-21 18:21
Status: complete
Tickets: 2/4
Base branch: main

**1-buy-hosting-plan** (manual, other)
Status: done

**2-deploy-site-host** (unattended, code, simple)
Status: needs-review
After 1.

**3-check-site-health** (attended, other, simple)
Status: blocked
After 1, 2.
Blocked: The host has no public address yet.

**4-fix-token-storage** (unattended, code, simple)
Status: in-progress, tests
After 2.
Fixes 2.
```
