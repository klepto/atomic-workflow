---
name: plan-goals
description: First stage of planning. Settles the goals of a task with the user, or resumes the goals of a task by its id.
argument-hint: "[task id] [--unattended] [prompt]"
allowed-tools: mcp__plugin_atomic-workflow_atomic-workflow__activate, mcp__plugin_atomic-workflow_atomic-workflow__taskGet, mcp__plugin_atomic-workflow_atomic-workflow__taskCreate, mcp__plugin_atomic-workflow_atomic-workflow__goalSave, mcp__plugin_atomic-workflow_atomic-workflow__goalDelete, mcp__plugin_atomic-workflow_atomic-workflow__designSave, mcp__plugin_atomic-workflow_atomic-workflow__ticketsSave, mcp__plugin_atomic-workflow_atomic-workflow__taskSetStatus, Bash(node:*), Read, Grep, Glob, WebSearch, WebFetch
---

# Plan goals

Settle the goals of a task with the user. A goal is settled once the user and you reach consensus on it and it is
stored.

Before anything else, read `../../references/planning.md`, relative to the base directory of this skill. It holds the
rules that every stage of planning shares: start, cascade, pushback, and the format of each part of the plan.

Arguments: `$ARGUMENTS`. A first word that is a number is the id of a task to resume. The word `--unattended` after
the task id selects unattended mode, as `## Unattended` says. The rest is the prompt. Without `--unattended`, the stage
runs as the rest of this skill says.

## Start

With `--unattended`, follow `## Unattended` below in place of this section.

With a task id, follow the start of planning with the stage `plan-goals`. Then, for a task that is not `complete`,
show the goal list, and ask what to change.

A task that is `complete` has its goals frozen, and this stage has no amend mode. Show the goal list, then say: "The
plan of this task is complete, so its goals are frozen. To change its design, run `/atomic-workflow:plan-design <task
id>`. To change its tickets, run `/atomic-workflow:plan-tickets <task id>`." Then stop, and ask nothing.

Without a task id, only activate, as the first step of the start of planning says. Then ask: "Let's begin planning,
what are your goals?" With a prompt, put below the question a goal list of the goals that you suggest from it. The
slug of the new task is three words from the prompt, or from the first goal without a prompt.

## Unattended

With `--unattended`, follow `## Unattended` of the planning rules, and ask nothing. A task that is `complete` or `done`
gets the line of those rules, not the message above. Otherwise:

1. Follow the start of planning with the stage `plan-goals`.
2. Keep the stored goals. Check each one against `## Pushback`.
3. Sharpen a goal that a rule flags, with `goalSave` and its `goalId`, so it keeps its source.
4. Split a goal that is too big: edit it to its first part, and add each other part with `goalSave` and the source
   `agent`.
5. Change no other goal, and add no goal that the pushback does not call for.
6. Finish as `## Finish` says.

## Finish

When the user is satisfied with the goal list, or at the end of unattended mode, call `taskSetStatus` with
`plan-design`. Then print the final goal list, and name the next stage: `/atomic-workflow:plan-design <task id>`.
