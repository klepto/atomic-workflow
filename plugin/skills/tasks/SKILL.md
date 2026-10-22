---
name: tasks
description: Lists the tasks of the atomic workflow in this repository.
disable-model-invocation: true
allowed-tools: mcp__plugin_atomic-workflow_atomic-workflow__activate, mcp__plugin_atomic-workflow_atomic-workflow__taskList, Bash(node:*)
---

# Tasks

1. Call the tool `activate` of the MCP server `atomic-workflow`. If its result does not start with
   `Atomic-workflow already attached.`, run the command it names with the Bash tool, with `run_in_background` set to
   true.
2. Call `taskList`.
3. Print each task as a paragraph, and separate two tasks with a blank line. Print nothing else. Without tasks, print
   `No tasks yet.`

Print a task with its creation time in local time, as `YYYY-MM-DD HH:MM`:

```markdown
**3-cache-layer-redis**
Date: 2026-10-21 18:21
Status: plan-design
Tickets: <completedTickets>/<uncompletedTickets>
```
