---
name: plan-tickets
description: Last stage of planning. Splits the design of a task into tickets, and revises the split with the user until they accept it. On a complete task, amends the tickets whose work has not started, and adds follow-up tickets that fix landed work.
argument-hint: "<task id>"
allowed-tools: mcp__plugin_atomic-workflow_atomic-workflow__activate, mcp__plugin_atomic-workflow_atomic-workflow__taskGet, mcp__plugin_atomic-workflow_atomic-workflow__taskCreate, mcp__plugin_atomic-workflow_atomic-workflow__goalSave, mcp__plugin_atomic-workflow_atomic-workflow__goalDelete, mcp__plugin_atomic-workflow_atomic-workflow__designSave, mcp__plugin_atomic-workflow_atomic-workflow__ticketsSave, mcp__plugin_atomic-workflow_atomic-workflow__taskSetStatus, Bash(node:*), Read, Grep, Glob, WebSearch, WebFetch
---

# Plan tickets

Split the design of a task into tickets, then revise the split with the user until they accept it.

Before anything else, read `../../references/planning.md`, relative to the base directory of this skill. It holds the
rules that every stage of planning shares: start, cascade, pushback, and the format of each part of the plan.

Arguments: `$ARGUMENTS`. The first word is the id of the task. Without one, ask for it.

## Start

Follow the start of planning with the stage `plan-tickets`. Then:

- In amend mode, when the task is `complete`, show the ticket list with the status of each ticket, and ask: "What
  would you like to change in the tickets? A ticket whose work started stays as it is, and a follow-up ticket can fix
  a ticket that needs review."
- Else with tickets, show the ticket list, and ask about the split.
- Without tickets, read the code that the design touches, split the design into tickets, store them, show the ticket
  list, and ask about the split.

Read the code yourself, in this session, with Read, Grep and Glob, since this skill may run inside a subagent, which
cannot start one. Reading is done when you can name the files that each ticket in the mode `unattended` or `attended` touches.

Ask about the split with: "Would you like any changes to the ticket split, or do you accept it?"

## Each turn

Show the description of a ticket when the user asks for it.

When the user asks for a follow-up ticket of a ticket that needs review, ask what its review found, unless they said
so. Then add the follow-up ticket at the end of the list, with `fixes` set to the id of that ticket, as the tickets of
the planning rules say.

## Finish

Outside amend mode, when the user accepts the split, call `taskSetStatus` with `complete`. Then print the final ticket
list, and tell the user that planning is done. Name the next step, with its two choices:
`/atomic-workflow:implement <task id>`, which implements the next ready ticket, or
`/atomic-workflow:implement-all <task id>`, which implements every ticket in the mode `unattended`, the ready ones in
parallel subagents.

In amend mode, when the user is satisfied with the tickets, do not call `taskSetStatus`. Print the final ticket list,
then what changed, as `## Amend` of the planning rules says, and tell the user that the task stays `complete`. For a
new follow-up ticket, tell the user to do its work with `/atomic-workflow:implement <task id> <ticket id>`.
