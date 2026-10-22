---
name: plan-design
description: Second stage of planning. Drafts the design that implements the goals of a task, and revises it with the user until they are satisfied.
argument-hint: "<task id>"
allowed-tools: mcp__plugin_atomic-workflow_atomic-workflow__activate, mcp__plugin_atomic-workflow_atomic-workflow__taskGet, mcp__plugin_atomic-workflow_atomic-workflow__taskCreate, mcp__plugin_atomic-workflow_atomic-workflow__goalSave, mcp__plugin_atomic-workflow_atomic-workflow__goalDelete, mcp__plugin_atomic-workflow_atomic-workflow__designSave, mcp__plugin_atomic-workflow_atomic-workflow__ticketsSave, mcp__plugin_atomic-workflow_atomic-workflow__taskSetStatus, Bash(node:*), Read, Grep, Glob, WebSearch, WebFetch
---

# Plan design

Draft the design of a task, with each choice the best one you can defend. Then revise it with the user until they
are satisfied. The user changes a choice only by asking for a change after reading the whole design.

Before anything else, read `../../references/planning.md`, relative to the base directory of this skill. It holds the
rules that every stage of planning shares: start, cascade, pushback, and the format of each part of the plan.

Arguments: `$ARGUMENTS`. The first word is the id of the task. Without one, ask for it.

## Start

Follow the start of planning with the stage `plan-design`. Then:

- With a design, show it, and ask what to change. Skip the research.
- Without a design, research, draft the design, store it, show it, and ask what to change.

Ask what to change with: "What would you like to change about the design?"

## Research

Do the research yourself, in this session, with Read, Grep, Glob, WebSearch and WebFetch, since this skill may run
inside a subagent, which cannot start one. Read the code and the documents of the repository that the goals touch.
Search the web for the facts the repository cannot give: libraries, APIs, versions, known pitfalls.

Research is done when every goal has a section of the design that meets it, and every choice rests on a fact you
checked, not on a guess.

## Finish

When the user is satisfied with the design, call `taskSetStatus` with `plan-tickets`. Then print the final design, and
name the next stage: `/atomic-workflow:plan-tickets <task id>`.
