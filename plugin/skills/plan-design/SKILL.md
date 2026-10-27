---
name: plan-design
description: Second stage of planning. Drafts the design that implements the goals of a task, and revises it with the user until they are satisfied. On a complete task, amends the design.
argument-hint: "<task id>"
allowed-tools: mcp__plugin_atomic-workflow_atomic-workflow__activate, mcp__plugin_atomic-workflow_atomic-workflow__taskGet, mcp__plugin_atomic-workflow_atomic-workflow__taskCreate, mcp__plugin_atomic-workflow_atomic-workflow__goalSave, mcp__plugin_atomic-workflow_atomic-workflow__goalDelete, mcp__plugin_atomic-workflow_atomic-workflow__designSave, mcp__plugin_atomic-workflow_atomic-workflow__ticketsSave, mcp__plugin_atomic-workflow_atomic-workflow__taskSetStatus, Bash(node:*), Read, Grep, Glob, WebSearch, WebFetch
---

# Plan design

Draft the design of a task: its parts, and the contracts between them, each the best one you can defend. Then revise
it with the user until they are satisfied. The user changes a choice only by asking for a change after reading the
whole design. The internals of each part are left to the agents of the tickets.

Before anything else, read `../../references/planning.md`, relative to the base directory of this skill. It holds the
rules that every stage of planning shares: start, cascade, pushback, and the format of each part of the plan.

Arguments: `$ARGUMENTS`. The first word is the id of the task. Without one, ask for it.

## Start

Follow the start of planning with the stage `plan-design`. Then:

- With a design, show it, and ask what to change. Skip the research.
- Without a design, research, draft the design, store it, show it, and ask what to change.

Ask what to change with: "What would you like to change about the design?"

In amend mode, the task is `complete`, and some of its tickets may be locked. Read the `## Contract` of each locked
ticket in the result of `taskGet`, so you know which sections of the design they quote. A change to one of those
sections needs a ticket that brings the code in line, as `## Amend` of the planning rules says.

## Research

Research only where the parts meet. Do it yourself, in this session, with Read, Grep, Glob, WebSearch and WebFetch,
since this skill may run inside a subagent, which cannot start one:

- Read the code where a contract touches the repository: the existing APIs, data and names that it builds on, so the
  contract fits them.
- Search the web only for an outside API or format that a contract names, when the repository does not show its
  facts.

Leave the internals of each part unresearched: the agent of its ticket researches them. An unknown that a contract
depends on, and that a quick look cannot settle, goes to `## Open questions`, with a research ticket that settles it.

Research is done when every goal has a part that meets it, every point where two parts meet has a contract, and each
contract fits the code it builds on.

## Finish

Outside amend mode, when the user is satisfied with the design, call `taskSetStatus` with `plan-tickets`. Then print
the final design, and name the next stage: `/atomic-workflow:plan-tickets <task id>`.

In amend mode, when the user is satisfied with the design, do not call `taskSetStatus`, and name no next stage. Print what changed, as `## Amend` of the planning
rules says, and tell the user that the task stays `complete`.
