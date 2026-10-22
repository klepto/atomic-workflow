---
name: plan-goals
description: First stage of planning. Settles the goals of a task with the user, or resumes the goals of a task by its id.
argument-hint: "[task id] [prompt]"
allowed-tools: mcp__plugin_atomic-workflow_atomic-workflow__activate, mcp__plugin_atomic-workflow_atomic-workflow__taskGet, mcp__plugin_atomic-workflow_atomic-workflow__taskCreate, mcp__plugin_atomic-workflow_atomic-workflow__goalSave, mcp__plugin_atomic-workflow_atomic-workflow__goalDelete, mcp__plugin_atomic-workflow_atomic-workflow__designSave, mcp__plugin_atomic-workflow_atomic-workflow__ticketsSave, mcp__plugin_atomic-workflow_atomic-workflow__taskSetStatus, Bash(node:*), Read, Grep, Glob, WebSearch, WebFetch
---

# Plan goals

Settle the goals of a task with the user. A goal is settled once the user and you reach consensus on it and it is
stored.

Before anything else, read `../../references/planning.md`, relative to the base directory of this skill. It holds the
rules that every stage of planning shares: start, cascade, pushback, and the format of each part of the plan.

Arguments: `$ARGUMENTS`. A first word that is a number is the id of a task to resume. The rest is the prompt.

## Start

With a task id, follow the start of planning with the stage `plan-goals`. Then, for a task that is not `complete`,
show the goal list, and ask what to change.

A task that is `complete` has its goals frozen, and this stage has no amend mode. Show the goal list, then say: "The
plan of this task is complete, so its goals are frozen. To change its design, run `/atomic-workflow:plan-design <task
id>`. To change its tickets, run `/atomic-workflow:plan-tickets <task id>`." Then stop, and ask nothing.

Without a task id, only activate, as the first step of the start of planning says. Then ask: "Let's begin planning,
what are your goals?" With a prompt, put below the question a goal list of the goals that you suggest from it. The
slug of the new task is three words from the prompt, or from the first goal without a prompt.

## Finish

When the user is satisfied with the goal list, call `taskSetStatus` with `plan-design`. Then print the final goal list,
and name the next stage: `/atomic-workflow:plan-design <task id>`.
