---
name: implement-tests
description: Second stage of the implementation of a ticket of type code. Writes unit tests for each public feature of the ticket from its acceptance criteria and its contract, runs them against the prototype, and updates the tests that its changes affect.
argument-hint: "<task id> <ticket id>"
allowed-tools: mcp__plugin_atomic-workflow_atomic-workflow__activate, mcp__plugin_atomic-workflow_atomic-workflow__taskGet, mcp__plugin_atomic-workflow_atomic-workflow__worktreeCreate, mcp__plugin_atomic-workflow_atomic-workflow__ticketSetStatus, Bash, PowerShell, Read, Edit, Write, Grep, Glob, WebSearch, WebFetch
---

# Implement: tests

Cover the public behavior of the ticket with unit tests, and bring the tests that its changes affect up to date. The
tests lock the behavior of the prototype. For a `complex` ticket, the stage `refactor` reshapes the code after you,
and every test must keep passing.

If this conversation has not read `../../references/implementation.md`, relative to the base directory of this skill,
read it first. It holds the rules of every stage.

Arguments: `$ARGUMENTS`: the id of the task, then the id of the ticket. Without both, ask for them.

If this conversation has not activated the atomic workflow yet, activate as `../../references/activate.md` says,
relative to the base directory of this skill. If this conversation does not hold the ticket, call `taskGet` for it.

## Work

Follow the steps of a stage in `implementation.md`, with the stage `tests`.

First, check the instructions of the repository. If they say to write no tests, write none, and commit nothing. End
with one line:

- `complex`: `Stage tests skipped: <the instruction, quoted>. Next stage: atomic-workflow:implement-refactor.`
- `simple`: `Stage tests skipped: <the instruction, quoted>. Next: land the ticket.`

Otherwise:

- Derive the tests from the acceptance criteria, `## Contract` and the decisions in the `wip` commits, not from the
  code: at least one test per criterion, and one per edge case and error that the contract or a decision names.
- Test through the public API of the ticket, the parts of `## Contract` that it provides and what else it exports, not
  through internals, so that the tests hold through a refactor.
- Find the existing tests that the changes of the ticket break or make wrong, from
  `git -C "<worktree>" diff <task branch>...HEAD`, and update them. Delete a test only when the ticket removes the
  behavior it tests on purpose, by its acceptance criteria or by a decision.
- Use the test framework, layout and helpers of the repository. Add a framework only when the repository has none and
  the ticket asks for one.
- Run the new tests against the prototype, then the whole test suite, and every other command of `## Verify`. Each
  must pass. When a test reveals a bug in the code, fix the code with the smallest change, not the test.

Commit with `wip(tests): <what the tests cover>`. End with one line:

- `complex`: `Stage tests done. Next stage: atomic-workflow:implement-refactor.`
- `simple`: `Stage tests done. Next: land the ticket.`
