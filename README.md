<p align="center"><img src="assets/logo.svg" alt="/atomic-workflow" width="496"></p>

<p align="center">
  <strong>Plan big changes with Claude, then ship them as small reviewed commits, one ticket at a time.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Claude_Code-plugin-D97757" alt="Claude Code plugin">
  <img src="https://img.shields.io/badge/version-0.0.0-blue" alt="Version 0.0.0">
  <img src="https://img.shields.io/badge/status-prototype-orange" alt="Status: prototype">
  <img src="https://img.shields.io/badge/node-%3E%3D24-339933" alt="Node.js 24 or newer">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License: MIT"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#why">Why</a> ·
  <a href="#features">Features</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#usage">Usage</a> ·
  <a href="#faq">FAQ</a> ·
  <a href="#development">Development</a>
</p>

atomic-workflow is a Claude Code plugin that plans a task with you into goals, a design and tickets, then implements
the tickets in isolated git worktrees. Each ticket lands as one commit that you review before it reaches your branch.
A local web app shows it all as it happens.

> [!WARNING]
> This project is a prototype. Commands, data and behavior can change in breaking ways between versions.

## Quick start

You need [Claude Code](https://code.claude.com/docs), Node.js 24 or newer, and git.

Clone the repository:

```sh
git clone https://github.com/<owner>/atomic-workflow-mcp.git
```

In a Claude Code session, add the marketplace from the `plugin/` folder of the clone, and install the plugin:

```
/plugin marketplace add ./atomic-workflow-mcp/plugin
/plugin install atomic-workflow@atomic-workflow
```

Then, in a Claude Code session inside any git repository, plan a task, let agents implement it, and approve the result:

```
> /atomic-workflow:plan Add a Redis cache in front of the product queries
  ... agree on the goals, the design and the tickets of task 3 ...

> /atomic-workflow:implement-all 3
  ... agents implement the tickets, and each one lands on the task branch ...

  Review the changes of each ticket in the web app, then:

> /atomic-workflow:approve 3
```

Or settle the goals with an agent, let it do the rest, and review at the end:

```
> /atomic-workflow:run Add a Redis cache in front of the product queries
```

The first command prints the address of the web app.

## Why

Hand a big change to an agent in one prompt, and these problems show up:

- **The agent drifts.** On a long task, it forgets what you agreed and builds something else. atomic-workflow writes
  the goals and the design down first, and every ticket checks its work against them.
- **One huge diff.** A day of agent work arrives as one change that nobody can review. Here, each ticket is one
  commit with a clear message, small enough to read.
- **Your checkout is busy.** An agent that edits your working copy blocks you, and two agents get in each other's way.
  Here, each ticket works in a git worktree of its own.
- **Review comes too late.** Problems found at the end mean rework of everything. Here, you review each ticket as it
  lands, and a problem becomes a follow-up ticket.

## Features

- **Planning in stages.** Settle the goals of a task first, then a design, then a split into tickets. You review and
  revise each stage before the next one starts.
- **Tickets that agents implement in parallel.** Each ticket gets its own branch and its own git worktree, so several
  agents work at once without touching your checkout or each other.
- **One commit per ticket.** The work of a ticket lands on the task branch as one squashed commit with a clear
  message, and the decisions that the agent took are listed in its body.
- **Review and approval.** Read the diff of each landed ticket, comment on it, and request changes as a follow-up
  ticket, or approve it. Once every ticket is approved, the task branch lands on your base branch.
- **Unattended runs.** Hand over a prompt or a planned task. An agent plans the goals with you, then takes the task to
  its end on its own, without questions.
- **A local web app.** See the tasks and their tickets, chat with the sessions and their subagents, review the
  changes, and keep an eye on the 5-hour and weekly usage limits of your account.

What sets atomic-workflow apart from a plan or a task list for an agent: it carries every ticket all the way to a
reviewed commit, it keeps every session of a repository on the same tasks through one shared server, and it gives you
a web app to follow and review the work.

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

An agent implements a ticket of code in stages: a first version that meets the acceptance criteria, then the tests,
then, for a complex ticket, a refactor to the final shape. It checks the work against the ticket, and lands it on the
task branch as one commit. The ticket then waits for your review. A review that finds a problem adds a follow-up
ticket that fixes it. When every ticket is approved, the task branch lands on the base branch.

See [Under the hood](#under-the-hood) for the branches, the worktrees and the servers.

## Usage

Run the commands in a Claude Code session inside a git repository. The first command starts the repository server
when none runs, and prints the address of the web app. `/atomic-workflow:atomic-workflow` prints it at any time.

| Command                                      | What it does                                                                                      |
|:---------------------------------------------|:--------------------------------------------------------------------------------------------------|
| `/atomic-workflow:plan [task] [prompt]`      | Plans a new task from a prompt, or resumes the planning of a task: goals, design, then tickets.   |
| `/atomic-workflow:implement <task> [ticket]` | Implements one ticket, the one named or the next ready one, and lands it on the task branch.      |
| `/atomic-workflow:implement-all <task>`      | Implements every ticket that an agent can do alone, with the ready tickets in parallel subagents. |
| `/atomic-workflow:approve <task> [ticket]`   | Approves the reviewed work of a ticket, or of every landed ticket, and lands the finished task.   |
| `/atomic-workflow:run <task or prompt>`      | Plans the goals with you, then runs a task to its end without you, from a prompt or any stage.    |
| `/atomic-workflow:tasks [task]`              | Lists the tasks of the repository, or shows one task with its tickets.                            |

A task or a ticket is named by its id, its slug, or both, such as `3`, `cache-layer-redis` or `3-cache-layer-redis`.

<details>
<summary><strong>More commands</strong></summary>

<br>

The implement commands run their stages for you, so you rarely call a stage yourself.

| Command                                                | What it does                                                                             |
|:-------------------------------------------------------|:-----------------------------------------------------------------------------------------|
| `/atomic-workflow:atomic-workflow`                     | Attaches the session to the repository server, so the web app can send it messages.      |
| `/atomic-workflow:plan-goals [task] [prompt]`          | First stage of planning: settles the goals of a task with you.                           |
| `/atomic-workflow:plan-design <task>`                  | Second stage of planning: drafts the design of a task, and revises it with you.          |
| `/atomic-workflow:plan-tickets <task>`                 | Last stage of planning: splits the design into tickets, or adds follow-up tickets later. |
| `/atomic-workflow:implement-prototype <task> <ticket>` | First stage of a ticket of code: the code that meets its acceptance criteria.            |
| `/atomic-workflow:implement-tests <task> <ticket>`     | Second stage: the tests that lock the behavior of the code.                              |
| `/atomic-workflow:implement-refactor <task> <ticket>`  | Last stage of a complex ticket: the code in its final shape, while every test passes.    |
| `/atomic-workflow:tasks-delete <task>`                 | Deletes a task with its tickets, its worktrees and its branches.                         |

</details>

## FAQ

<details>
<summary><strong>Where does atomic-workflow keep its data?</strong></summary>

<br>

The tasks, their plans and their tickets live in `.agents/atomic-workflow/` in the main checkout of your repository.
The worktrees of the tickets live below `~/.atomic-workflow/worktrees/`, outside your checkout. The branches of a task
start with `atomic-workflow/`.

</details>

<details>
<summary><strong>Does it touch my checkout or my branch?</strong></summary>

<br>

Not while it works. Every ticket works in a worktree of its own, on a branch of its own. Your base branch changes only
when you approve the last ticket of a task, and the task branch lands on it.

</details>

<details>
<summary><strong>Where is the web app, and on which port?</strong></summary>

<br>

The repository server picks a free port on `127.0.0.1` each time it starts, so the address changes. The first command
of a session prints the address, and `/atomic-workflow:atomic-workflow` prints it at any time. The web app is only
reachable from your own machine.

</details>

<details>
<summary><strong>Does the server keep running in the background?</strong></summary>

<br>

No. The repository server stops when the last Claude Code session of the repository disconnects. The next session
that needs it starts it again.

</details>

<details>
<summary><strong>How do I update the plugin?</strong></summary>

<br>

Pull the clone, then update the marketplace in a Claude Code session:

```sh
git -C atomic-workflow-mcp pull
```

```
/plugin marketplace update atomic-workflow
```

</details>

<details>
<summary><strong>How do I uninstall it?</strong></summary>

<br>

In a Claude Code session, uninstall the plugin, and remove its marketplace:

```
/plugin uninstall atomic-workflow@atomic-workflow
/plugin marketplace remove atomic-workflow
```

Delete the tasks you no longer need first with `/atomic-workflow:tasks-delete`, which also removes their worktrees and
branches. Then delete `.agents/atomic-workflow/` in your repository.

</details>

## Under the hood

Each task has its own branch, made from your base branch, such as `main` or `development`. Each ticket works on a
branch made from the task branch, in a worktree of its own below `~/.atomic-workflow/worktrees/`. Your checkout is left
alone. Before a ticket starts, the task branch is rebased onto the base branch, so the ticket sees both your latest
changes and the tickets that landed before it.

Three moving pieces do the work:

- **A session server.** Each Claude Code session runs one small MCP server, which gives the agent the tools of the
  workflow.
- **A repository server.** One shared server per repository holds the data of every task, coordinates the sessions
  and their subagents, and serves the web app. The first session that needs it starts it, and every later session of
  the same repository attaches to it. Its data lives in `.agents/atomic-workflow/` in your main checkout.
- **Skills.** The slash commands of the plugin drive the work: they tell the agent which stage to run, and which
  tools to call.

## Development

The repository has three parts:

- `plugin/`: the plugin as Claude Code loads it, with its skills, hooks, agents and the committed bundles in `dist/`.
  It is also the marketplace.
- `mcp/`: the TypeScript sources of the session server, the repository server and the hooks, bundled into
  `plugin/dist/`.
- `web/`: the React sources of the web app, built into `plugin/dist/web/`.

The built bundles in `plugin/dist/` are committed, so the install needs no build and no `npm install`.

Install the packages of `mcp/` and `web/` once, from the root of the repository:

```sh
npm ci --prefix mcp
npm ci --prefix web
```

In `mcp/`:

```sh
npm run build       # bundle the servers and hooks into plugin/dist/
npm run typecheck   # check the types
npm test            # run the tests
npm run lint        # lint the sources
npm run format      # format the sources
```

In `web/`:

```sh
npm run build       # build the web app into plugin/dist/web/
npm run typecheck   # check the types
npm test            # run the tests
npm run dev         # serve the web app with live reload, against the running repository server
npm run lint        # lint the sources
npm run format      # format the sources
```

Run a session with the plugin loaded from your working copy, from the root of the repository:

```sh
claude --plugin-dir ./plugin
```

## License

[MIT](LICENSE)
