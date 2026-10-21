# Planning

The plan of a task has three parts, in order: its goals, its design and its tickets. Each part has a stage and a
skill: `/atomic-workflow:plan-goals`, `/atomic-workflow:plan-design` and `/atomic-workflow:plan-tickets`. The
atomic-workflow server holds the plan; your memory of it does not count. Show each part from the latest result of a
tool.

The status of a task names the stage the user works on: `plan-goals`, `plan-design` or `plan-tickets`. Once the user
is satisfied with the whole plan, the status is `complete`, and the plan is frozen.

## Start

1. Call the tool `activate` of the MCP server `atomic-workflow`. If its result does not start with
   `Atomic-workflow already attached.`, run the command it names with the Bash tool, with `run_in_background` set to
   true.
2. With a task id, call `taskGet`. If its status is `complete`, tell the user that its plan is complete, and stop.
3. Call `taskSetStatus` with the stage of the skill. If it fails because the task lacks an earlier part, name the skill
   of that part to the user, and stop.

Start the first reply with the first two lines of the result of `activate`, word for word: the status and the web URL.

## Cascade

Every part of the plan stays open until the plan is complete. A request in any stage can change any part: store a
change to the goals with `taskCreate`, `goalSave` or `goalDelete`, to the design with `designSave`, and to the
tickets with `ticketsSave`.

A change can make a later part wrong. After you store a change, rewrite each later part that exists and that the
change affects, in order: goals, then design, then tickets. Store each rewrite, and show it in the same reply.

## Pushback

Challenge a requested change to any part before you store it, when it:

- contradicts a goal or a decision. Name both, and ask which one wins.
- is sub-optimal or inefficient. Name the better choice, and what it gains.
- has drawbacks or pitfalls. Name them concretely, and suggest an alternative.
- is vague, with no way to tell when it is met. Suggest wording that can be checked.
- is too big for one goal or one ticket. Suggest a split.
- overlaps another goal or ticket. Suggest a merge.

Consensus is reached when the user accepts your alternative, or keeps the change after hearing your objection. In the
second case, record your objection: in the details of the goal, in a line `Objection:` of the decision, or in a
section `## Objection` of the ticket.

## Layout

Show each item of a list as a paragraph, and separate two items with a blank line. Use no Markdown list for them,
since the terminal shows no blank line between list items.

## Goals

A goal has a summary of one line that names it, and details on any further lines: context, constraints, comments.

- Store a goal only once the user approves its exact wording. "All good" on a list of suggestions approves each one.
- Store the first goal of a new task with `taskCreate`, and each later goal with `goalSave`.
- Set `source` to `user` for a goal the user wrote, and to `agent` for a suggestion of yours that the user accepted.
- Edit a goal with `goalSave` and its `goalId`. Pass its summary and its details in full, since details that you leave
  out are cleared.
- The id of a goal is its number, 1 to n in the order of the goals. Deleting a goal moves each later goal down by
  one.

Show the goal list with the number and summary of each goal in bold on the first line, and its details in regular
text below:

```markdown
**1. About page explains how production works**
Cap list sync, queue order, daily uploads.

**2. Text targets site visitors, not developers**
Plain language, with no class names.
```

## Design

The design holds the decisions that implement all the goals, each the best choice you can defend: what to build and
why. The breakdown into work belongs to the tickets. Store the design with `designSave`, as a whole text that replaces
the stored one, and show it whole.

Write it in Markdown with two sections. `## Goals` lists each goal with its number and summary, and the numbers of
the decisions that cover it. `## Decisions` lists each decision as a paragraph: its number and a one-line summary in
bold on the first line, then the choice, the reason, the alternatives you rejected and why, and the numbers of the
goals it serves:

```markdown
**3. Store the design as one Markdown column of the task**
Choice: a nullable `design TEXT` column on `task`, replaced whole on each save.
Why: the user reads and revises the design as one text, and the tickets are cut from it the same way.
Rejected: a table of decisions, which would give each decision fields that nothing reads.
Goals: 1, 4.
```

Number the decisions 1 to n. After an insert or a removal, renumber them, and update the numbers that refer to them.

## Tickets

A ticket is the work of one agent in one session, which ends in one commit that passes the checks of the repository.
Cut the design along its seams: one feature or ability per ticket, so that tickets that do not depend on each other
can run in parallel. Store the tickets with `ticketsSave`, as a whole list that replaces the stored one. Ticket n in
the list gets the id n.

- `complexity`: `simple` for mechanical work that follows an existing pattern, `moderate` for several files with
  small decisions inside the design, `complex` for cross-cutting work, tricky logic or real judgement.
- `slug`: exactly three lowercase words joined by hyphens.
- `summary`: one sentence.
- `dependsOn`: the ids of the earlier tickets that must be done first. Order the tickets so that each one comes after
  the tickets it depends on.
- `description`: Markdown with everything that an agent needs to do the ticket in a fresh context, which has not seen
  the goals, the design or the other tickets. Use these sections: `## Context` for the task and where the ticket fits,
  `## Decisions` for the decisions of the design that it implements, quoted in full, `## Changes` for the files to
  touch and what changes in each, `## Acceptance criteria` for checkable conditions, and `## Verify` for the commands
  that check the work.

A description is done when an agent that reads only it can do the work without asking a question.

Show the ticket list with the id and slug of each ticket in bold, its complexity, its summary, and its dependencies:

```markdown
**1-add-status-column** (simple)
Replace the phase of a task with its status.

**2-store-ticket-list** (moderate)
Store the tickets of a task in their own table.
After 1.
```

## Each turn

End each reply with the part of the stage, whole, and with each part that a cascade rewrote. Then ask what to change.
