---
name: implement-refactor
description: Last stage of the implementation of a complex ticket of type code. Reshapes the prototype of the ticket to its final shape, with its public API and its documentation, while every test keeps passing.
argument-hint: "<task id> <ticket id>"
allowed-tools: mcp__plugin_atomic-workflow_atomic-workflow__activate, mcp__plugin_atomic-workflow_atomic-workflow__taskGet, mcp__plugin_atomic-workflow_atomic-workflow__worktreeCreate, mcp__plugin_atomic-workflow_atomic-workflow__ticketSetStatus, Bash, PowerShell, Read, Edit, Write, Grep, Glob, WebSearch, WebFetch
---

# Implement: refactor

Bring the code of the ticket to the shape it keeps, while every test of the stage `tests` keeps passing. Only a
`complex` ticket runs this stage, and it is the last one.

If this conversation has not read `../../references/implementation.md`, relative to the base directory of this skill,
read it first. It holds the rules of every stage.

Arguments: `$ARGUMENTS`: the id of the task, then the id of the ticket. Without both, ask for them.

If this conversation has not activated the atomic workflow yet, activate as `../../references/activate.md` says,
relative to the base directory of this skill. If this conversation does not hold the ticket, call `taskGet` for it.

## Work

Follow the steps of a stage in `implementation.md`, with the stage `refactor`. Its work starts from the prototype and
its tests, in the commits of the ticket:

- Reshape the code to its final shape, as the final shape in `implementation.md` says.
- Keep the behavior that the tests lock. Run the tests after each step of the reshape, and keep every one passing.
- Change a test only when the public API of `## Design` requires it, such as a name or a signature that the prototype
  did not follow. Never change a test to hide a change of behavior.
- Write no new tests. If the stage `tests` wrote none, since the repository says to write no tests, check each
  acceptance criterion by running the code after the reshape.

Run the whole test suite, and every command of `## Verify`. Each must pass. Commit with
`wip(refactor): <what changed>`, and end with `Stage refactor done. Next: land the ticket.`
