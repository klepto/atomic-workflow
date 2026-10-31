# atomic-workflow

A Claude Code plugin that plans a task with you into goals, a design and tickets, then implements the tickets in
isolated git worktrees. A local web app shows it all as it happens.

## Features

- **Planning in stages.** Settle the goals of a task first, then a design, then a split into tickets. You review and
  revise each stage before the next one starts.
- **Tickets that agents implement in parallel.** Each ticket gets its own branch and its own git worktree, so several
  agents work at once without touching your checkout or each other.
- **One commit per ticket.** The work of a ticket lands on the task branch as one squashed commit with a clear
  message, and the decisions that the agent took are listed in its body.
- **Review and approval.** Read the diff of each landed ticket, comment on it, and request changes as a follow-up
  ticket, or approve it. Once every ticket is approved, the task branch lands on your base branch.
- **Unattended runs.** Hand over a prompt or a planned task, and an agent takes it to the end on its own, without
  questions.
- **A local web app.** See the tasks and their tickets, chat with the sessions and their subagents, review the
  changes, and keep an eye on the 5-hour and weekly usage limits of your account.

## How it works

```
prompt
  -> goals -> design -> tickets           planning, revised with you at each stage
  -> one worktree per ticket              agents implement the ready tickets, in parallel
  -> one commit per ticket                each ticket lands on the task branch
  -> review and approve                   comments become follow-up tickets
  -> task branch lands on the base branch
```

A task starts from a prompt. Planning turns it into goals that say what must be true at the end, a design that settles
how the parts fit together, and tickets that each do one piece of the work. A ticket names what it depends on, its
acceptance criteria, and the commands that check it.

Each task has its own branch, made from your base branch, such as `main` or `development`. Each ticket works on a
branch made from the task branch, in a worktree of its own below `~/.atomic-workflow/worktrees/`. Your checkout is left
alone. Before a ticket starts, the task branch is rebased onto the base branch, so the ticket sees both your latest
changes and the tickets that landed before it.

An agent implements a ticket of code in stages: a first version that meets the acceptance criteria, then the tests,
then, for a complex ticket, a refactor to the final shape. It checks the work against the ticket, and lands it on the
task branch as one commit. The ticket then waits for your review. A review that finds a problem adds a follow-up
ticket that fixes it. When every ticket is approved, the task branch lands on the base branch.

Three moving pieces do the work:

- **A session server.** Each Claude Code session runs one small MCP server, which gives the agent the tools of the
  workflow.
- **A repository server.** One shared server per repository holds the data of every task, coordinates the sessions
  and their subagents, and serves the web app. The first session that needs it starts it, and every later session of
  the same repository attaches to it. Its data lives in `.agents/atomic-workflow/` in your main checkout.
- **Skills.** The slash commands of the plugin drive the work: they tell the agent which stage to run, and which
  tools to call.

## Requirements

- [Claude Code](https://code.claude.com/docs)
- Node.js 24 or newer
- git

## Installation

The plugin and its marketplace are both named `atomic-workflow`. The marketplace lives in the `plugin/` folder of this
repository, not at its root, so add it from a local clone:

```sh
git clone https://github.com/<owner>/atomic-workflow-mcp.git
```

Then, in a Claude Code session, add the marketplace by the path of the `plugin/` folder, and install the plugin:

```
/plugin marketplace add ./atomic-workflow-mcp/plugin
/plugin install atomic-workflow@atomic-workflow
```

The same commands work from your shell, as `claude plugin marketplace add ./atomic-workflow-mcp/plugin` and
`claude plugin install atomic-workflow@atomic-workflow`.

The built bundles in `plugin/dist/` are committed, so the install needs no build and no `npm install`.

## Usage

Run the commands in a Claude Code session inside a git repository. The first command starts the repository server
when none runs, and prints the address of the web app. `/atomic-workflow:atomic-workflow` prints it at any time.

The common flow:

| Command                                                | What it does                                                                                      |
|:-------------------------------------------------------|:--------------------------------------------------------------------------------------------------|
| `/atomic-workflow:plan [task] [prompt]`                | Plans a new task from a prompt, or resumes the planning of a task: goals, design, then tickets.   |
| `/atomic-workflow:implement <task> [ticket]`           | Implements one ticket, the one named or the next ready one, and lands it on the task branch.      |
| `/atomic-workflow:implement-all <task>`                | Implements every ticket that an agent can do alone, with the ready tickets in parallel subagents. |
| `/atomic-workflow:approve <task> [ticket]`             | Approves the reviewed work of a ticket, or of every landed ticket, and lands the finished task.   |
| `/atomic-workflow:run <task or prompt>`                | Runs a task to its end without you, from a prompt, any stage of planning, or a complete plan.     |
| `/atomic-workflow:tasks [task]`                        | Lists the tasks of the repository, or shows one task with its tickets.                            |

The rest:

| Command                                                | What it does                                                                                      |
|:-------------------------------------------------------|:--------------------------------------------------------------------------------------------------|
| `/atomic-workflow:atomic-workflow`                     | Attaches the session to the repository server, so the web app can send it messages.               |
| `/atomic-workflow:plan-goals [task] [prompt]`          | First stage of planning: settles the goals of a task with you.                                    |
| `/atomic-workflow:plan-design <task>`                  | Second stage of planning: drafts the design of a task, and revises it with you.                   |
| `/atomic-workflow:plan-tickets <task>`                 | Last stage of planning: splits the design into tickets, or adds follow-up tickets later.          |
| `/atomic-workflow:implement-prototype <task> <ticket>` | First stage of a ticket of code: the code that meets its acceptance criteria.                     |
| `/atomic-workflow:implement-tests <task> <ticket>`     | Second stage: the tests that lock the behavior of the code.                                       |
| `/atomic-workflow:implement-refactor <task> <ticket>`  | Last stage of a complex ticket: the code in its final shape, while every test passes.             |
| `/atomic-workflow:tasks-delete <task>`                 | Deletes a task with its tickets, its worktrees and its branches.                                  |

A task or a ticket is named by its id, its slug, or both, such as `3`, `cache-layer-redis` or `3-cache-layer-redis`.
The implement commands run their stages for you, so you rarely call a stage yourself.

A short session:

```
> /atomic-workflow:plan Add a Redis cache in front of the product queries
  ... agree on the goals, the design and the tickets of task 3 ...

> /atomic-workflow:implement-all 3
  ... agents implement the tickets, and each one lands on the task branch ...

  Review the changes of each ticket in the web app, then:

> /atomic-workflow:approve 3
```

Or let an agent do it all, and review at the end:

```
> /atomic-workflow:run Add a Redis cache in front of the product queries
```

## Development

The repository has three parts:

- `plugin/`: the plugin as Claude Code loads it, with its skills, hooks, agents and the committed bundles in `dist/`.
  It is also the marketplace.
- `mcp/`: the TypeScript sources of the session server, the repository server and the hooks, bundled into
  `plugin/dist/`.
- `web/`: the React sources of the web app, built into `plugin/dist/web/`.

Install the packages of `mcp/` and `web/` once, from the root of the repository:

```sh
npm ci --prefix mcp
npm ci --prefix web
```

In `mcp/`:

```sh
npm run build       # bundle the servers and hooks into plugin/dist/
npm run typecheck   # check the types
npm run lint        # lint the sources
npm run format      # format the sources
```

In `web/`:

```sh
npm run build       # build the web app into plugin/dist/web/
npm run typecheck   # check the types
npm run dev         # serve the web app with live reload, against the running repository server
npm run lint        # lint the sources
npm run format      # format the sources
```

Run a session with the plugin loaded from your working copy, from the root of the repository:

```sh
claude --plugin-dir ./plugin
```

## Project status

This project is a prototype. Commands, data and behavior can change in breaking ways between versions.
