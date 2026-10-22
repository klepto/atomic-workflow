---
name: implement-prototype
description: First stage of the implementation of a ticket of type code. Writes the code that meets every acceptance criterion of the ticket, without tests, as a prototype for a complex ticket and in its final shape for a simple one.
argument-hint: "<task id> <ticket id>"
allowed-tools: mcp__plugin_atomic-workflow_atomic-workflow__activate, mcp__plugin_atomic-workflow_atomic-workflow__taskGet, mcp__plugin_atomic-workflow_atomic-workflow__worktreeCreate, mcp__plugin_atomic-workflow_atomic-workflow__ticketSetStatus, Bash, PowerShell, Read, Edit, Write, Grep, Glob, WebSearch, WebFetch
---

# Implement: prototype

Write the code that makes every acceptance criterion of the ticket hold, end to end, without tests. The stage `tests`
locks its behavior with tests after you.

If this conversation has not read `../../references/implementation.md`, relative to the base directory of this skill,
read it first. It holds the rules of every stage.

Arguments: `$ARGUMENTS`: the id of the task, then the id of the ticket. Without both, ask for them.

If this conversation has not activated the atomic workflow yet, activate as `../../references/activate.md` says,
relative to the base directory of this skill. If this conversation does not hold the ticket, call `taskGet` for it.

## Work

Follow the steps of a stage in `implementation.md`, with the stage `prototype`. Its work depends on the complexity of
the ticket:

- `complex`: the stage `refactor` brings the code to its final shape after the tests. Follow the API that `## Design`
  names: its files, names and signatures. The prototype proves the approach, so get the behavior right first, and
  leave the polish to the stage `refactor`.
- `simple`: no refactor follows, so write the code in its final shape now, as the final shape in `implementation.md`
  says.

For both:

- Write no tests.
- Check each acceptance criterion by running the code, not only by reading it.
- Run the commands of `## Verify` that need no new tests, such as the build, the type check and the linter. Each must
  pass.

Commit with `wip(prototype): <what works now>`, and end with `Stage prototype done. Next stage:
atomic-workflow:implement-tests.`
