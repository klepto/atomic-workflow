---
name: tasks-delete
description: Deletes a task of the atomic workflow with its goals, its design and its tickets.
argument-hint: "<task id | task slug>"
disable-model-invocation: true
allowed-tools: mcp__plugin_atomic-workflow_atomic-workflow__activate, mcp__plugin_atomic-workflow_atomic-workflow__taskList, mcp__plugin_atomic-workflow_atomic-workflow__taskDelete, Bash(node:*)
---

# Delete a task

Arguments: `$ARGUMENTS`. The first word names the task: its id, its slug, or both as `/tasks` prints them, such as
`3-cache-layer-redis`. Without one, ask for it.

1. Call the tool `activate` of the MCP server `atomic-workflow`. If its result does not start with
   `Atomic-workflow already attached.`, run the command it names with the Bash tool, with `run_in_background` set to
   true.
2. Find the id of the task. A word that starts with a number names the task with that id. A slug alone names the tasks
   that `taskList` returns with that slug:
   - With none, tell the user that no task has that slug, and stop.
   - With several, print them as `/tasks` does, ask which id to delete, and stop.
3. Call `taskDelete` with the id. Then print `Deleted **<id>-<slug>**.` with the id and slug of its result.
