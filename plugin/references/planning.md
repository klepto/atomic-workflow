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

- contradicts a goal or a choice of the design. Name both, and ask which one wins.
- is sub-optimal or inefficient. Name the better choice, and what it gains.
- has drawbacks or pitfalls. Name them concretely, and suggest an alternative.
- is vague, with no way to tell when it is met. Suggest wording that can be checked.
- is too big for one goal or one ticket. Suggest a split.
- overlaps another goal or ticket. Suggest a merge.

Consensus is reached when the user accepts your alternative, or keeps the change after hearing your objection. In the
second case, record your objection: in the details of the goal, in the section `## Objections` of the design, or in
a section `## Objection` of the ticket.

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

The design is the document of the task: what gets built and why, with each choice the best one you can defend. A
developer who implements the task, and a reviewer of its pull request, read it with no other context: they have not
seen the conversation or the code. The breakdown into work belongs to the tickets. Store the design with `designSave`,
as a whole text that replaces the stored one, and show it whole.

Write it in Markdown, like a section of a README, in this order:

- A title that names the task, and an opening paragraph: what changes for the people who use the result, and why, in
  plain words with no file names.
- `## Goals`: each goal with its number and summary, so a reader sees what the design must meet.
- One section per area of the work, named for the area, such as `## Storage` or `## Command line`. State each choice
  concretely: the files, the data, the APIs, the commands and the limits, with the reason for each choice that is not
  evident. Add a short example in a code block where it shows a choice faster than words.
- `## Rejected`: each alternative that you rejected, and why.
- `## Objections`: each objection that the user kept a choice over. Leave it out when there is none.

Describe the result, never the conversation: "Reads go through Redis", not "We agreed on Redis". Every goal has a
section that meets it, and every section serves a goal. The user names a section by its heading to change it.

```markdown
# Cache layer for the API

Read endpoints answer in under 100 ms. Reads go through a cache in front of the database, and writes clear what they
touch, so a response is at most 30 seconds stale.

## Goals

**1. Cut the p95 latency of reads below 100 ms**

## Reads

- Every GET handler in `src/api/` reads through `cache.get(key, load)`, with keys `<resource>:<id>` and a TTL of 30 s.
- Writes call `cache.invalidate(key)` after their commit.

## Rejected

- An in-process LRU cache. Each instance would hold its own copy, which a write on another instance cannot clear.
```

## Tickets

A ticket is the work of one session: an agent's, or the user's with an agent beside them. It is done when its
acceptance criteria hold, and ends in one commit that passes the checks of the repository if it changes the
repository. Cut the design along its seams: one feature or ability per ticket, so that tickets that do not depend on
each other can run in parallel. Store the tickets with `ticketsSave`, as a whole list that replaces the stored one.
Ticket n in the list gets the id n.

- `mode`: who does the work. `unattended` for an agent alone from start to finish, such as code, moving files or
  research. `attended` for an agent that needs the user between turns, such as a debugging cycle in which the user
  reproduces the bug. `manual` for the user, such as paying for a hosting service or setting up a proxy, with an agent
  that guides them and checks their work.
- `complexity`: `simple` for mechanical work that follows an existing pattern, `moderate` for several files with
  small decisions inside the design, `complex` for cross-cutting work, tricky logic or real judgement. A `manual`
  ticket has none.
- `slug`: exactly three lowercase words joined by hyphens.
- `summary`: one sentence.
- `dependsOn`: the ids of the earlier tickets that must be done first. Order the tickets so that each one comes after
  the tickets it depends on, and each `manual` ticket as early as its dependencies allow, so the user does their part
  first.
- `description`: Markdown with everything needed to do the ticket in a fresh context, which has not seen the goals,
  the design or the other tickets. Use these sections: `## Context` for the task and where the ticket fits,
  `## Design` for the sections of the design that it implements, quoted in full, `## Changes` for the files to
  touch and what changes in each, or the steps of the user for a `manual` ticket, `## Outputs` for each result that a
  later ticket reads and where it goes, `## Acceptance criteria` for checkable conditions, and `## Verify` for the
  commands that check the work. Leave out `## Outputs` when no later ticket reads a result.

A research ticket writes its findings to the file that its `## Outputs` names, so the tickets after it read them. A
secret, such as a token or a password, goes to an environment variable or a secret store, and `## Outputs` names only
where it goes, never its value.

A description is done when whoever reads only it, an agent or the user, can do the work without asking a question.

Show the ticket list with the id and slug of each ticket in bold, its mode and complexity, its summary, and its
dependencies:

```markdown
**1-buy-hosting-plan** (manual)
Buy a hosting plan and store its access token.

**2-deploy-site-host** (unattended, moderate)
Deploy the site to the new host with the access token.
After 1.
```

## Each turn

End each reply with the part of the stage, whole, and with each part that a cascade rewrote. Then ask what to change.
