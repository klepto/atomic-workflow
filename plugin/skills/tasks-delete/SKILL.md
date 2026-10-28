---
name: tasks-delete
description: Deletes a task of the atomic workflow with its goals, its design, its tickets, its worktrees and branches, and its subagents with their chats.
argument-hint: "<task id | task slug>"
allowed-tools: mcp__plugin_atomic-workflow_atomic-workflow__activate, mcp__plugin_atomic-workflow_atomic-workflow__taskDelete, Bash(node:*)
---

# Delete a task

Arguments: `$ARGUMENTS`. The first word names the task: its id, its slug, or both as `/tasks` prints them, such as
`3-cache-layer-redis`. Without one, ask for it.

1. Activate as `../../references/activate.md` says, relative to the base directory of this skill.
2. Call `taskDelete` with the first word, without `force`.
   - If it fails because no task has that id or slug, or because several tasks have that slug, print its message,
     and stop.
   - If it fails because work has not landed, print its message, and ask the user whether to delete the task anyway
     and lose that work. Stop. Only when the user confirms in their next message, call `taskDelete` again with
     the same word and `force` set to true.
3. Print `Deleted **<id>-<slug>**.` with the id and slug of its result. Then print the number of worktrees and branches
   that it removed, the number of subagents that it deleted with their chats, each process of its
   `stoppedProcesses`, and each of its warnings. Read them as `../../references/removal.md` says, relative to the base
   directory of this skill, and end with its block, if any.
