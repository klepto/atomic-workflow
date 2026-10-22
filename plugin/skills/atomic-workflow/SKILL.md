---
name: atomic-workflow
description: Activates the atomic workflow of this repository, and attaches the session to its repository server.
allowed-tools: mcp__plugin_atomic-workflow_atomic-workflow__activate, Bash(node:*)
---

# Atomic workflow

1. Activate once, as `../../references/activate.md` says, relative to the base directory of this skill. Run the
   command that the result of `activate` names even when the result starts with `Atomic-workflow already attached.`.
2. If the user invoked this skill, print the first two lines of the result and nothing else. If a model invoked it,
   such as from another skill, show the web URL, and print nothing else.

Each time that command ends, read its output and do what it says. It names the next command to run in the background,
and the messages of the atomic-workflow server, which you handle like messages of the user.
