# Planning

The plan of a task has three parts, in order: its goals, its design and its tickets. Each part has a stage and a
skill: `/atomic-workflow:plan-goals`, `/atomic-workflow:plan-design` and `/atomic-workflow:plan-tickets`. The
atomic-workflow server holds the plan; your memory of it does not count. Show each part from the latest result of a
tool.

The status of a task names the stage the user works on: `plan-goals`, `plan-design` or `plan-tickets`. Once the user
is satisfied with the whole plan, the status is `complete`. A complete plan can still be amended, as `## Amend` says.
Once the task branch lands, the status is `done`, and the plan is frozen.

## Start

1. Activate as `activate.md` says, in the directory of this file.
2. With a task id, call `taskGet`. If its status is `done`, tell the user that the task is done and its plan cannot
   change, and stop. If its status is `complete`, the stage runs in amend mode, as `## Amend` says: skip step 3.
3. Call `taskSetStatus` with the stage of the skill. If it fails because the task lacks an earlier part, name the skill
   of that part to the user, and stop.

Start the first reply with the web URL that `activate.md` names.

## Cascade

Every part of the plan stays open until the plan is complete. A request in any stage can change any part: store a
change to the goals with `taskCreate`, `goalSave` or `goalDelete`, to the design with `designSave`, and to the
tickets with `ticketsSave`. In amend mode, the goals are frozen, and only the design and the tickets can change.

A change can make a later part wrong. After you store a change, rewrite each later part that exists and that the
change affects, in order: goals, then design, then tickets. Store each rewrite, and show it in the same reply, as
`## Each turn` says.

## Amend

A task that is `complete` can still change until it is `done`, while its tickets are worked on. Only what started
work used is locked:

- The goals are frozen. `/atomic-workflow:plan-goals` has no amend mode: it tells the user so, names
  `/atomic-workflow:plan-design <task id>` and `/atomic-workflow:plan-tickets <task id>`, and stops.
- The design can change, since it is the document of the result.
- A ticket whose status is not `not-started` is locked, since its work started. Pass it to `ticketsSave` exactly as
  `taskGet` returns it, at its id: `ticketsSave` refuses a list that changes its id, its fields or its dependencies.
- A ticket that is `not-started` can change. It can go away only when no locked ticket comes after it, since each
  later ticket would move down by one id. A new ticket goes at the end of the list.

In amend mode, `plan-design` and `plan-tickets` never call `taskSetStatus`, and the task stays `complete`.

A change to a section of the design that a locked ticket quotes in its `## Contract` leaves the code of that ticket
out of line with the design. In the same change, as part of the cascade, add a `not-started` ticket that brings the code in
line, or change a `not-started` ticket to do it. Its `## Context` names the locked ticket and the changed section.
When the locked ticket needs review, set `fixes` of the new ticket to its id, so it is not approved before its code is
in line.

The finish of an amend prints what changed: each section of the design that changed, by its heading, and each ticket
that was added, changed or removed, by its id and slug. It does not change the status.

## Pushback

Challenge a requested change to any part before you store it, when it:

- contradicts a goal or a choice of the design. Name both, and ask which one wins.
- is sub-optimal or inefficient. Name the better choice, and what it gains.
- has drawbacks or pitfalls. Name them concretely, and suggest an alternative.
- is vague, with no way to tell when it is met. Suggest wording that can be checked.
- is too big for one goal or one ticket. Suggest a split.
- overlaps another goal or ticket. Suggest a merge.
- pins an internal choice in the design, one that only the code of one ticket sees. Suggest leaving it to that
  ticket, whose agent decides it with the code in front of it. If the user keeps it, it becomes a contract.

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

The design is the map of the task: the parts that get built, and the contracts between them. A developer who
implements a ticket, and a reviewer of the pull request, read it with no other context: they have not seen the
conversation or the code. Store the design with `designSave`, as a whole text that replaces the stored one. Show it as
`## Each turn` says.

A part is one moving piece of the result, such as a module, a service, a command or a page. A contract is what one
part exposes and another part relies on: an API with its signatures and errors, a data shape, a file format, a shared
name, a protocol. A choice that every part must make the same way, or that the user requires, is a contract too.
Everything else is internal to a part: its files, its structure, its helpers, its libraries. The internals belong to
the agent of each ticket, who researches them and decides them with the code in front of it. The design binds only
its contracts.

Write it in Markdown, like a section of a README, in this order:

- A title that names the task, and an opening paragraph: what changes for the people who use the result, and why, in
  plain words with no file names.
- `## Goals`: each goal with its number and summary, so a reader sees what the design must meet.
- `## Parts`: each part with what it does, in one or two lines, and where it lives in the repository when it exists
  already.
- One section per contract, named for it, such as `## Cache API` or `## Event format`. State it concretely: the
  names, signatures, data shapes, errors and limits that the parts on both sides rely on, and which parts provide
  and use it. Give the reason for each choice that is not evident. Add a short example in a code block where it shows
  the contract faster than words.
- `## Open questions`: each unknown that the plan leaves to a ticket, and the ticket that settles it. Leave it out when
  there is none.
- `## Rejected`: each alternative to a contract that you rejected, and why.
- `## Objections`: each objection that the user kept a choice over. Leave it out when there is none.

Describe the result, never the conversation: "Reads go through Redis", not "We agreed on Redis". Every goal has a part
that meets it, every part serves a goal, and every point where two parts meet has a contract. The user names a section
by its heading to change it.

```markdown
# Cache layer for the API

Read endpoints answer in under 100 ms. Reads go through a cache in front of the database, and writes clear what they
touch, so a response is at most 30 seconds stale.

## Goals

**1. Cut the p95 latency of reads below 100 ms**

## Parts

- Cache: a Redis client that stores the result of a load under a key. New, in `src/cache/`.
- Read handlers: the GET handlers in `src/api/`, which read through the cache.
- Write handlers: the POST, PUT and DELETE handlers in `src/api/`, which clear what they touch.

## Cache API

The cache provides it, and both kinds of handlers use it.

- `cache.get<T>(key: string, load: () => Promise<T>): Promise<T>` returns the cached value, or calls `load` and caches
  its result for 30 s. A failure of Redis falls back to `load`, so the cache never fails a request.
- `cache.invalidate(key: string): Promise<void>` clears a key. Writes call it after their commit.
- Keys are `<resource>:<id>`, such as `user:42`.

## Open questions

- The Redis client library: the ticket of the cache picks it.

## Rejected

- An in-process LRU cache. Each instance would hold its own copy, which a write on another instance cannot clear.
```

## Tickets

A ticket is the work of one session: an agent's, or the user's with an agent beside them. It is done when its
acceptance criteria hold, and ends in one commit that passes the checks of the repository if it changes the
repository. Cut the design along its parts: one part, or one feature of a part, per ticket, so that tickets that do
not depend on each other can run in parallel. A ticket that uses a contract depends on the ticket that provides it,
unless both can build against the contract alone. Store the tickets with `ticketsSave`, as a whole list that replaces the stored one.
Ticket n in the list gets the id n.

- `mode`: who does the work. `unattended` for an agent alone from start to finish, such as code, moving files or
  research. `attended` for an agent that needs the user between turns, such as a debugging cycle in which the user
  reproduces the bug. `manual` for the user, such as paying for a hosting service or setting up a proxy, with an agent
  that guides them and checks their work.
- `complexity`: `simple` for work that follows an existing pattern or makes small decisions inside one part,
  across one or several files. `complex` for cross-cutting work, tricky logic or real judgement. A `manual` ticket has
  none.
- `type`: how the work runs. `code` for work that changes the code of the repository, which runs in stages: prototype
  and tests for a `simple` ticket, prototype, tests and refactor for a `complex` one. `other` for any other work, such
  as research, moving files or the steps of a `manual` ticket, which runs in one pass.
- `slug`: exactly three lowercase words joined by hyphens.
- `summary`: one sentence.
- `dependsOn`: the ids of the earlier tickets that must be done first. Order the tickets so that each one comes after
  the tickets it depends on, and each `manual` ticket as early as its dependencies allow, so the user does their part
  first.
- `description`: Markdown with everything needed to do the ticket in a fresh context, which has not seen the goals,
  the design or the other tickets. It says what to build, and leaves how to build it to the agent of the ticket. Use
  these sections:
  - `## Context`: the task, and where the ticket fits.
  - `## Contract`: each contract section of the design that the ticket provides or uses, quoted in full, with which
    side the ticket is on. Leave it out when the ticket touches no contract.
  - `## Approach`: a starting point for an agent ticket, in a few lines: the area of the repository it likely touches,
    and the approach you see. It is guidance: the agent researches, and takes a better approach when it finds one.
  - `## Steps`: for a `manual` ticket, in place of `## Approach`, the steps of the user, in order.
  - `## Outputs`: each result that a later ticket reads, and where it goes. Leave it out when no later ticket reads a
    result.
  - `## Acceptance criteria`: behavior that can be checked from outside the part, such as what a command prints or an
    API returns. A criterion names a file or a function only when a contract names it.
  - `## Verify`: the commands that check the work.
- `fixes`: for a follow-up ticket, the id of the earlier ticket that it fixes, whose work landed and needs review.
  Otherwise `null`. A landed ticket is never reopened: when its review finds a problem, a follow-up ticket fixes it.
  The server adds the id to `dependsOn`, so the follow-up ticket can start while the ticket it fixes needs review. The
  ticket it fixes cannot be approved until the follow-up ticket lands. The `## Context` of a follow-up ticket names
  the ticket that it fixes and the problem that the review found, and its `## Acceptance criteria` say when the
  problem is gone.

A research ticket writes its findings to the file that its `## Outputs` names, so the tickets after it read them. A
secret, such as a token or a password, goes to an environment variable or a secret store, and `## Outputs` names only
where it goes, never its value.

A description is done when whoever reads only it, an agent or the user, knows what to build and when it is done
without asking a question.

Show the ticket list with the id and slug of each ticket in bold, its mode, type and complexity, its summary, its
dependencies, and the ticket that it fixes. In amend mode, add the status of each ticket, so the user sees which
tickets are locked:

```markdown
**1-buy-hosting-plan** (manual, other)
Buy a hosting plan and store its access token.

**2-deploy-site-host** (unattended, code, simple)
Deploy the site to the new host with the access token.
After 1.
```

In amend mode, with a follow-up ticket:

```markdown
**2-deploy-site-host** (unattended, code, simple)
Deploy the site to the new host with the access token.
Status: needs-review
After 1.

**3-fix-token-storage** (unattended, code, simple)
Read the access token from the secret store, not from the config file.
Status: not-started
After 2.
Fixes 2.
```

## Each turn

End each reply with the part of the stage, and with each part that a cascade rewrote. Then ask what to change.

- Show the goal list and the ticket list whole, since they are short.
- Show the design whole the first time a stage shows it, and when the user asks for it.
- Otherwise, after a change to the design, show only the sections that changed, each one whole. Then show the list
  of the headings of the design.
