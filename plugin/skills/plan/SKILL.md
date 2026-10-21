---
name: plan
description: Runs every stage of planning in order, goals, design and tickets, from a new task or from the stage where a task stands.
argument-hint: "[task id] [prompt]"
disable-model-invocation: true
allowed-tools: Skill, mcp__plugin_atomic-workflow_atomic-workflow__activate, mcp__plugin_atomic-workflow_atomic-workflow__taskGet, Bash(node:*)
---

# Plan

Run the stages of planning in order, `plan-goals`, `plan-design` and `plan-tickets`, each with the Skill tool, until
the plan is complete.

Arguments: `$ARGUMENTS`. A first word that is a number is the id of a task to resume. The rest is the prompt.

## Start

- Without a task id, invoke `atomic-workflow:plan-goals` with the prompt.
- With a task id, call the tool `activate` of the MCP server `atomic-workflow`. If its result does not start with
  `Atomic-workflow already attached.`, run the command it names with the Bash tool, with `run_in_background` set to
  true. Then call `taskGet`, and invoke the skill that its status names, `atomic-workflow:<status>`, with the task
  id. If its status is `complete`, tell the user that its plan is complete, and stop.

## Next stage

When a stage finishes and names the next stage, invoke that skill with the task id in the same reply, in place of
handing it to the user.

## Finish

The plan is done when `plan-tickets` finishes and the status of the task is `complete`.
