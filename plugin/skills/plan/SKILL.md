---
name: plan
description: Runs every stage of planning in order, goals, design and tickets, from a new task or from the stage where a task stands.
argument-hint: "[task id] [prompt]"
allowed-tools: Skill, mcp__plugin_atomic-workflow_atomic-workflow__activate, mcp__plugin_atomic-workflow_atomic-workflow__taskGet, Bash(node:*)
---

# Plan

Run the stages of planning in order, `plan-goals`, `plan-design` and `plan-tickets`, each with the Skill tool, until
the plan is complete.

Arguments: `$ARGUMENTS`. A first word that is a number is the id of a task to resume. The rest is the prompt.

## Start

- Without a task id, invoke `atomic-workflow:plan-goals` with the prompt.
- With a task id:
  1. Activate as `../../references/activate.md` says, relative to the base directory of this skill. If its result
     starts with `Started the atomic-workflow server.`, print the web URL. The stage skill then finds the server
     attached, and does not print the web URL again.
  2. Call `taskGet` with the task id.
  3. If its status is `done`, tell the user that the task is done and its plan cannot change, and stop.
  4. If its status is `complete`, invoke `atomic-workflow:plan-tickets` with the task id. It runs in amend mode, which
     changes the design and the tickets whose work has not started, and keeps the task `complete`.
  5. Else, invoke the skill that its status names, `atomic-workflow:<status>`, with the task id.

## Next stage

When a stage finishes and names the next stage, invoke that skill with the task id in the same reply, in place of
handing it to the user. Only `plan-design` and `plan-tickets` are next stages. Leave any other skill that a stage
names, such as `/atomic-workflow:implement`, to the user.

## Finish

The plan is done when `plan-tickets` finishes and the status of the task is `complete`. An amend is done when
`plan-tickets` finishes its amend.
