---
name: atomic-workflow
description: Activates the atomic workflow of this repository. Use only when the user types /atomic-workflow.
disable-model-invocation: true
allowed-tools: mcp__plugin_atomic-workflow_atomic-workflow__activate, Bash(node:*)
---

# Atomic workflow

1. Call the tool `activate` of the MCP server `atomic-workflow` once.
2. If its result names a command, run that command with the Bash tool, with `run_in_background` set to true.
3. Print the first two lines of its result and nothing else.

Each time that command ends, read its output and do what it says. It names the next command to run in the background,
and the messages of the atomic-workflow server, which you handle like messages of the user.
