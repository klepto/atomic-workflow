# atomic-workflow-mcp

A ground-up rewrite of the previous project, `C:/_dev/atomic-workflow-plugin`. It starts very small and
grows one verified step at a time.

## Terms

- Session server: the MCP server of one Claude Code session. Claude Code starts one per session, over standard input
  and output, and stops it when the session ends.
- Repository server: one process per repository, shared by every session server that attaches to it. All worktrees of
  a repository share it.

## Phase 0

A Claude Code plugin with one skill, `/atomic-workflow`, and one MCP server that does nothing yet.

- Claude Code starts the session server of the plugin at the start of every session. A plugin cannot start an MCP
  server on the call of a skill, so the session server lies dormant instead: it offers the tool `activate` and nothing
  else.
- `/atomic-workflow` calls `activate`. The session server connects to the repository server, and launches it first
  when none runs.
- The address of the repository server is a named pipe on Windows and a Unix domain socket elsewhere, named after a
  hash of the common git directory. Only one process can listen on it, so two launches at the same time leave one
  repository server.
- The repository server counts its connections. It ends when the last session server leaves, or when no session
  server attaches in its first 10 seconds. No process id and no lock file is involved.
- The repository server starts through a short-lived launcher process. It so has no living parent, and Claude Code
  killing the process tree of a session server on Windows does not reach it.

## Phase 1

The repository server serves a web UI, which only said hello world in this phase.

- The repository server starts an HTTP server on a free port of `127.0.0.1` before it listens on its address, and stops
  it when it ends.
- On each new connection, the repository server sends a greeting first: one line of JSON, `{"url": "..."}`, with the
  URL of the web server.
- `activate` waits for the greeting and returns the URL. A repository server that sends no valid greeting within 5
  seconds fails the attach.

## Phase 2

Clients talk to the repository server over one protocol: JSON-RPC 2.0. The only method so far is `echo`, which returns
its message.

- A method has a name, a description, a flag `agent`, a zod schema of its parameters by name, and a handler. Every method sits in one
  list, `Methods`, and every way in reaches the same list.
- On the address of the repository server, each message is one line of JSON, in both directions. Either end can send
  requests.
- The web server takes one message in the body of each `POST` to `/rpc`, and answers with the response, or with `204`
  for a notification.
- A client calls `hello` first on each connection to the address, with the version of the protocol and its role. The
  result holds the URL of the web server. `hello` replaces the greeting of phase 1.
- Only a client in the role `session` counts as an attached session server. A client in the role `client`, such as the
  command line tool, does not keep the repository server alive.
- While attached, the session server offers one tool per method that has the flag `agent`, which forwards the call to
  the repository server. The tools go away when the connection closes. Each tool costs context on every turn, so only
  the methods that agents need have the flag. The web UI and the command line tool reach every method.
- Batches and parameters by position are not supported.

```
→ {"jsonrpc":"2.0","id":1,"method":"echo","params":{"message":"Hi"}}
← {"jsonrpc":"2.0","id":1,"result":{"message":"Hi"}}
```

## Phase 3

The repository server keeps persistent data in one SQLite database per repository. The first data is the sessions and
a message log:

- A session has the identifier that its agent gives it, its agent, `claude` or `codex`, the directory of its project
  and its start time. A session stays registered for good, and registering it again changes nothing.
- A message belongs to a registered session, and has a sender, `user` or `agent`, a content and a timestamp in ms
  since the epoch. It may have a message id, which the agent gives it, and which its session logs only once.
  The log can be read for one session or for all of them.

How it works:

- Data sits behind stores, one interface per kind of data, such as `MessageLogStore`. Methods reach the stores through
  the context that dispatch passes to them, never through SQLite.
- The database file is `.agents/atomic-workflow/database/database.db` in the main worktree, which `git worktree list`
  names first. Every worktree of a repository shares it. The files of the write-ahead log sit beside it, and a
  `.gitignore` with `*` keeps the whole directory out of git.
- Only the repository server opens the database, so no two processes write to it at once, except for a moment when two
  repository servers start at the same time. The session server passes the directory of its project with
  `--directory`.
- The database uses the built-in `node:sqlite` of Node.js, so the bundles stay free of native modules.
- `PRAGMA user_version` counts the steps of the schema that the database has run. The repository server runs the
  missing steps on start, in one transaction, and refuses a database that is newer than itself.
- The methods `registerSession`, `logMessage` and `listMessages` register a session, add to the log and read it.
  Agents do not see them as tools.

## Phase 4

The session server logs the transcript of its session into the message log, from `activate` until its connection to
the repository server closes. The log costs the session no tokens: no tool, no tool result and no hook takes part in
it, and its failures go to the standard error of the session server, which only the logs of the agent show.

- The transcript is the file that the agent appends one line of JSON to for each entry of the session. A `Transcript`
  hides the agent: it names the agent, the session and the file, and turns a line into a message, or into none.
  `FindTranscript` detects the agent from the environment. Only Claude Code is supported; Codex needs one more
  implementation of `FindTranscriptFunction`, which `FindTranscript` then tries as well.
- Claude Code writes the transcript to
  `<session id>.jsonl` in a directory of `~/.claude/projects/`, or of `$CLAUDE_CONFIG_DIR/projects/`. The session
  server looks for the file in every directory there. A file that does not exist yet is expected in the directory that
  is named after `CLAUDE_PROJECT_DIR`, with each character that is not a letter or a digit replaced by `-`.
- A user message is an entry of the type `user` with text. An agent message is the text of an entry of the type
  `assistant`. Tool calls, tool results, thinking, entries that Claude Code wrote itself (`isMeta`), entries of
  subagents (`isSidechain`) and summaries of a compaction are no messages. A message that a channel delivered is an
  entry that Claude Code wrote itself, but with `origin.kind` `channel`, so it is a user message, without the
  `<channel>` tag around it. The format is internal to Claude Code, so the session server reads only the fields that it
  needs, and skips a line that it does not understand.
- The session server registers the session, then reads the transcript from its start and checks its size every 500 ms
  for appended bytes. It keeps an incomplete last line, and a character whose bytes a read splits, for the next read.
  A check of the size works the same on every file system, which a watch of the file does not.
- Each message carries the identifier that the agent gives it, `uuid` for Claude Code, as its message id. A session
  logs each message id once, so a session server that reads the transcript again from its start,
  after a new `activate`, adds no message twice.
- After `/clear`, Claude Code runs a new session with a new transcript in the same process, so the session server and
  its connection stay. Claude Code writes the id of the session that it runs now to `sessions/<process id>.json` in its
  configuration directory, and the session server is a direct child of Claude Code, so it finds the file through the
  process id of its parent. While attached, it reads the file every 500 ms. When the id changes, it reads the old
  transcript one last time, then registers the new session and logs its transcript, with no new `activate`. Without
  the file, it uses `CLAUDE_CODE_SESSION_ID`, the session that Claude Code started it in, and does not follow `/clear`.
- The page of the web server shows the latest 100 messages of the log, newest first, and asks every 2 seconds for
  the messages after the newest one it shows. `listMessages` without `after` returns the latest messages.

Rejected:

- The agent calls a tool for each message. It costs tokens on every turn, depends on the model, and cannot log the
  last output of the model.
- Hooks on `UserPromptSubmit`, `PostToolUse` and `Stop`. Each event starts a Node process, about 100 ms on Windows,
  and the text of the assistant between tools is missing, so the transcript is needed anyway.

## Phase 5

The repository server delivers messages to an attached session, and the session server puts each one into the chat
of its session, where the agent sees it as a new event, also while the session is idle.

- A session server calls `bindSession` with the id of its session after `hello`, and again each time the agent moves
  on to a new session, such as after `/clear`. The repository server keeps the connection of each bound session in
  memory. A connection serves one session at a time, and a closed connection serves none. Only a client in the role
  `session` can bind a session.
- `deliverMessage` takes the id of a session and the text of a message, and calls `deliver` on the session server of
  that session. It fails when no attached session server serves the session. Agents do not see it as a tool.
- `listAttachedSessions` returns the ids of the bound sessions, the latest bound last.
- The page of the web server has a form above the log: a text area, the attached session to send to, the latest one
  unless another is picked, and a button. Ctrl+Enter sends as well. The form calls `deliverMessage`, and the list of
  sessions is refreshed with the log.
- `deliver` is the only method of a session server, in its own list, `SessionMethods`. Its context pushes the message
  into the chat.
- The way into the chat is a channel, a research preview of Claude Code. The session server declares the experimental
  capability `claude/channel` and sends the notification `notifications/claude/channel` with the message as its
  `content`. The agent sees it as `<channel source="...">` with the message in it. Its `instructions` tell the agent to
  handle each message like a message of the user.
- Claude Code loads a channel only when the session starts with `--channels`, which only accepts plugins of an
  allowlist. This plugin is not on it, so the session needs
  `--dangerously-load-development-channels plugin:atomic-workflow@atomic-workflow` and a confirmation at start.
  Without it, Claude Code drops each message without a word, and `deliverMessage` still succeeds.
- Claude Code confirms no message, so `deliverMessage` resolves once the session server has sent it to the agent.
- `PROTOCOL_VERSION` is 2. A session server and a repository server of different versions do not attach: a repository
  server that still runs from before the update serves until its last session leaves.
- The web server only answers requests to the host and port of its URL, and a `POST` to `/rpc` must declare
  `Content-Type: application/json`. A web page of another origin then cannot send a message, and a host name that
  resolves to the local host does not reach the web server.

```
node src/cli.main.ts deliverMessage '{"sessionId":"<session id>","content":"Run the tests"}'
```

Rejected:

- A command `watch` of the command line tool that prints one line per message, which the agent starts with the Monitor
  tool. It only uses stable features, but it needs one more process, and the agent must start it.
- Hooks that poll on `UserPromptSubmit` or `Stop`. They only deliver at the boundaries of a turn, so an idle session
  never sees the message.
- `CLAUDE_CODE_MESSAGING_SOCKET` and the inbox tools of Claude Code. Their protocol is internal and not documented.
- The session id in `hello`. It changes after `/clear` while the connection stays.

## Phase 6

The repository server starts subagents inside an orchestrator session, and sends them commands. An orchestrator is a
session that a user runs. A subagent runs inside it, and shows up in its terminal as a background agent of the
orchestrator.

- A session has a role, `orchestrator` or `subagent`, and a subagent has the id of its orchestrator as its parent.
  Step 2 of the schema adds both to the sessions. A session that `registerSession` registers without a role is an
  orchestrator.
- `startSubagent` takes an optional prompt and the session id of an orchestrator, the one that was bound last by
  default. It gives the subagent a new session id, registers it, and puts the prompt into its inbox as its first
  command. It then delivers a message into the chat of the orchestrator that asks it to call the Agent tool in the
  background, with the agent `atomic-workflow:worker` of the plugin and a prompt that names only the session id of the
  subagent. The method returns `{"sessionId": "..."}` once the subagent has attached, and fails after 60 seconds
  without it.
- A Claude Code subagent cannot receive channel events, which only reach the orchestrator. The definition of the agent
  `worker` makes it call the tool `awaitCommand` with its session id in a loop. The first call attaches the subagent.
  Each call returns the next command of its inbox, with the status `command` and the content, or waits for one up to
  23 hours and returns the status `idle`. The status `stop` ends the subagent with the single word `stopped`.
- Claude Code hands the last message of a background agent back to its orchestrator as a notification, and no
  setting turns that off. The word `stopped` keeps the notification short, and the message that asks for the spawn
  tells the orchestrator not to act on it.
- Each idle return costs the subagent a turn, which reads its whole context again, so the wait is long. Claude Code
  ends a tool call after `MCP_TOOL_TIMEOUT`, about 28 hours by default, which the environment can lower. The
  `timeout` of the session server in `.mcp.json`, 24 hours, overrides it, and the wait stays below it.
- The repository server keeps the subagents in memory, beside the connections of the bound sessions. A subagent goes
  away when it is stopped, when it ends, or when the connection of its orchestrator closes.
- `deliverMessage` to a subagent puts the message into its inbox. The subagent receives it as the result of a tool,
  which is no message of its transcript, so the repository server logs it as a message of the user.
- `stopSubagent` takes the session id of a subagent. The subagent gets the status `stop` from its pending or next
  `awaitCommand`.
- `listAttachedSessions` returns `{"sessions": [...]}`, each with its session id, role and parent: the bound
  orchestrators first, then the attached subagents.
- Once the subagent attaches, the repository server calls `followSubagent` on the session server of the orchestrator,
  which logs the transcript of the subagent. Claude Code writes it to `subagents/agent-<agent id>.jsonl` in a
  directory beside the transcript of the orchestrator, named after its session. The session server finds it by the
  session id in its first entry, the prompt, and keeps only the entries of the subagent, `isSidechain`. It stops when
  `agent-<agent id>.meta.json` beside it sets `finished`, and then calls `endSubagent` on the repository server, which
  removes the subagent. This covers a subagent that ends without `stopSubagent`, such as one that `TaskStop` kills or
  that fails. A subagent that `stopSubagent` removed already stays removed.
- `listMessages` takes a role. The page shows the messages of the orchestrators, or only the messages of the picked
  subagent.
- The list of sessions of the page shows each attached subagent below its orchestrator, and the form sends to the
  picked one. A second button, which only an orchestrator enables, calls `startSubagent` inside it, with the text of
  the text area as the prompt if one is typed, and then picks the new subagent.
- `PROTOCOL_VERSION` is 4, since the session server calls `endSubagent`, which an older repository server lacks.

```
node src/cli.main.ts startSubagent '{"prompt":"Run the tests"}'
node src/cli.main.ts deliverMessage '{"sessionId":"<subagent session id>","content":"Fix the failing test"}'
node src/cli.main.ts stopSubagent '{"sessionId":"<subagent session id>"}'
```

Rejected:

- A subagent as a separate `claude -p` process. It would have its own session server and channel, but it would not
  show up as a child of the orchestrator.
- A tool `reply` that the subagent calls with the result of each command. The transcript holds the result already, at
  no cost in tokens.

## Phase 7

The repository server delivers messages to the main session and to its subagents the same way: through an inbox per
session, which the agent waits on with a command that it runs in the background. The end of the command wakes the
agent. This replaces the channel of phase 5 and the blocking tool `awaitCommand` of phase 6, so a session needs no
`--dangerously-load-development-channels`, and an idle subagent costs no turns.

- Each bound session and each started subagent has an inbox in the memory of the repository server. `bindSession`
  opens the inbox of a session, and `startSubagent` the inbox of a subagent. An inbox closes when the connection of its
  session server closes, and the inbox of a subagent also when `stopSubagent` or `endSubagent` removes it.
- When a session server binds a new session, such as after `/clear`, the inbox of its old session moves to the new
  one, with its messages and its wait. The agent keeps receiving messages after `/clear` without a new `activate`.
- `deliverMessage` puts the message into the inbox of the session, and logs it as a message of the user, since the
  agent receives it as the output of a command, which is no message of its transcript. Claude Code writes the notice
  that a background command ended as an entry of its own (`isMeta`), which the log skips.
- `awaitCommand` takes a session id and `after`, the number of the last message that the session received. It drops
  the messages up to `after`, and returns the messages that are left, all at once, or waits as long as it takes for the
  next one. It returns the status `messages` with the messages and the session that the inbox belongs to now, `stop`
  when the inbox is closed or the session has none, or `replaced` when a newer wait of the same session takes over. The
  first call of a subagent attaches it. Agents do not see it as a tool.
- A message ends the wait 500 ms after it comes in, with every message that came in by then, so a burst of messages
  wakes the agent once. Each wake costs a notice, a call that reads the output, and a call that starts the next wait.
- `awaitCommand` also takes the beginning of a session id, which it resolves to the only open inbox whose session id
  begins with it.
- A message counts as received only once the next wait names its number, so a message that a wait took, but that never
  reached the agent, comes again with the next wait.
- The command line tool `await-command.mjs <session id> [--after <number>]` in `plugin/dist/` calls `awaitCommand` and
  prints what the agent must do: run the next wait in the background first, with the exact command line it names, then
  handle the messages like messages of the user. The agent reads this text on each message, so it stays two short
  lines. It names the session of the inbox, so a wait from before `/clear` continues with the new session. A wait that
  ends with `stop`, or that fails, tells the agent not to run it again.
  The command line is `node "<path with forward slashes>" <session id> [--after <number>]`, which runs the same in
  Bash and in PowerShell. It names the session by the first 8 characters of its id, to save tokens on each wait.
- `activate` returns once the session is bound, and its result names the first command line of the session. The skill
  runs it in the background.
- The message that asks the orchestrator to spawn a subagent gives the subagent a prompt with its session id and its
  first command line. The agent `worker` runs the command in the background, and reports back with the single word
  `waiting` at the end of each turn, or `stopped` once its messages are stopped.
- Claude Code hands each report of a background agent back to the orchestrator, after each turn of the subagent, not
  only at its end. The metadata of the subagent sets `finished` at each report, so the session server no longer reads
  it as the end of the subagent. The end is now `stoppedByUser`, which `TaskStop` sets.
- The session server no longer declares `claude/channel`, and offers no method `deliver`. `.mcp.json` no longer raises
  the timeout of a tool call, since no tool waits.
- `PROTOCOL_VERSION` is 6, since `awaitCommand` takes the beginning of a session id, which an older repository server
  reads as a session without an inbox.

```
node plugin/dist/await-command.mjs <session id>
node plugin/dist/await-command.mjs <session id> --after 3
```

Rejected:

- A `Monitor` on a command that prints one line per message. A `Monitor` expires after 30 minutes and must be started
  again, which costs a turn every 25 minutes of an idle session. It also cuts each line after about 500 bytes.
- A foreground command that waits. `Bash` ends a foreground command after 10 minutes, so an idle session costs a turn
  every 10 minutes.
- A prompt that tells the subagent never to report back. Claude Code sends the report at the end of each turn of a
  subagent, not the model, and only a blocking wait avoids the end of the turn.

## Phase 8

The agent keeps receiving the messages of the repository server after `/clear`. The session server moves the inbox to
the new session already, but the new session starts with an empty context: it does not know that it is attached, and
the wait from before `/clear` either ends with it or wakes an agent that does not trust its output.

- The plugin has a `SessionStart` hook with the matcher `clear`, which runs `session-start.mjs` in `plugin/dist/`. The
  hook reads the id of the new session from its input, and asks the repository server whether that session has an
  inbox. If it does, its output adds the command line of the first wait of the new session to the context of the
  agent, with the same instruction that the skill gives, so the agent starts the wait in the background.
- `awaitInbox` takes a session id, and waits up to 5 seconds for the session to have an inbox, since the session server
  may bind the new session up to a second after the hook starts. It returns the command line that waits for the
  messages of the session, or `null` when no inbox opens. Agents do not see it as a tool.
- The new wait acknowledges no message, so a message that the wait from before `/clear` took, but that the agent never
  handled, comes again. A wait from before `/clear` that still runs ends with `replaced`.
- Outside of a git repository, without a running repository server, or without an inbox for the new session, the hook
  prints nothing. A session that was never activated costs `/clear` the 5 seconds of the wait only while a repository
  server runs for its repository.
- `PROTOCOL_VERSION` is 7, since the hook calls `awaitInbox`, which an older repository server lacks.

Rejected:

- The wait from before `/clear`, which Claude Code may keep running. Its output reaches the new session as the output
  of a command that the agent did not start, so the agent does not handle it like messages of the user.

## Phase 9

The user sees in the terminal of a session what each message of the repository server says. Claude Code shows the end
of a wait as a notice that names the command, and the output that holds the message stays folded inside a tool call.

- The output of a wait that holds messages tells the agent to start its reply with one quote line per message, which it
  lists as they are: `> ` and the first line of the message, cut to 200 characters. A quote that leaves out part of
  the message ends with `…`. The tool cuts the quote, so the agent copies it, and the quote of a long message costs
  few tokens.
- A subagent quotes nothing, since its replies do not show in the terminal, and its definition asks for a report of
  one word. `awaitCommand` returns whether the session that waits is a started subagent, as `subagent`.

Rejected:

- A `PostToolUse` hook that shows the message to the user with `systemMessage`, at no cost in tokens. It only sees the
  output when the agent reads it with the tool that the hook watches, and must tell the output of a wait apart from
  any other.

## Phase 10

The first phase of planning: `/atomic-workflow:plan-goals` settles the goals of a task with the user. Later phases
settle its design and its tickets, and `/atomic-workflow:plan` runs all three in order.

- A task has a sequential id from 1, a slug in kebab case, a phase, `goals`, `design`, `tickets` or `done`, and the
  time it was created. Step 3 of the schema adds the tables `task` and `goal`.
- A goal belongs to a task, and has a summary of one line, optional details, and a source: `user` for a goal that the
  user gave, `agent` for a suggestion of the agent that the user accepted. An edit of its text keeps its source. Goal
  ids are unique across every task, and the agent numbers the goals of a task 1 to n for the user.
- `createTask` creates a task with its first goal, so no task is left without goals. `saveGoal` adds a goal, or with a
  `goalId` replaces the summary and details of one. `deleteGoal` deletes a goal. `completeGoals` moves a task with at
  least one goal from `goals` to `design`. `getTask` returns a task with its goals. Each method returns the whole
  task, which the agent shows the user after each change, so the list it shows always comes from the database.
- The goals of a task only change in the phase `goals`. In another phase, `saveGoal`, `deleteGoal` and `completeGoals`
  fail.
- Agents see all five methods as tools.
- `/atomic-workflow:plan-goals [task id] [prompt]` activates the atomic workflow first. Without a task id, it asks for
  the goals, and suggests goals from the prompt. With a task id, it resumes the goals of that task. The agent stores a
  goal once the user approves it. Before that, it pushes back on a goal that contradicts another one, has drawbacks, is
  vague, is too big, or overlaps another one. A goal that the user keeps over an objection records the objection in its
  details.
- `PROTOCOL_VERSION` is 8, since the session server offers tools that an older repository server lacks.

```
node src/cli.main.ts createTask '{"slug":"cache-layer","summary":"Cut API latency","source":"user"}'
node src/cli.main.ts saveGoal '{"taskId":1,"summary":"Use Redis","details":"The team knows it","source":"agent"}'
node src/cli.main.ts getTask '{"taskId":1}'
```

Rejected:

- The goals as a JSON column of the task. A table of goals lets a goal be edited and deleted alone, and gives it
  fields of its own.
- The first goal through `saveGoal` without a task id. `saveGoal` would then have three modes.

## Phase 11

The second phase of planning: `/atomic-workflow:plan-design <task id>` drafts the design of a task, the decisions
that implement all of its goals, and revises it with the user until they are satisfied.

- A task has a design: one Markdown text, or `null` before the first draft. The phase `decisions` is renamed `design`.
  Step 4 of the schema rebuilds the table `task` with the new phase and the column `design`, since SQLite cannot
  change a `CHECK` in place. The steps of the schema run with foreign keys off, and fail if they leave a foreign key
  broken.
- `saveDesign` replaces the whole design of a task. `completeDesign` moves a task with a design from `design` to
  `tickets`. Both fail in another phase. `getTask` returns the design too. Agents see both methods as tools.
- The skill researches in the session that calls it, with no subagent, since it may run inside a subagent itself. It
  reads the repository and searches the web until every goal has a decision that covers it.
- The agent picks each decision itself, and shows the whole design. The user changes it only by asking for a change
  after reading it. The agent pushes back on a change that contradicts a goal, is sub-optimal, or has pitfalls. A
  change that the user keeps over an objection records the objection in its decision.
- Each change rewrites and stores the whole design, and each reply shows it. Revisions are not kept.
- A goal that comes up in this phase joins the design, not the goals of the task, which stay as they were.
- `PROTOCOL_VERSION` is 9, since the session server offers tools that an older repository server lacks.

Rejected:

- A table of decisions. The user reads and revises the design as one text, and the next phase reads it the same way.
- A field named `plan`. `/atomic-workflow:plan` names all three phases.
- Research in Explore subagents. A subagent cannot start subagents.

## Phase 12

The last stage of planning: `/atomic-workflow:plan-tickets <task id>` splits the design of a task into tickets, and
revises the split with the user until they accept it. Every part of the plan stays open until the plan is complete.

- A ticket has an id from 1 within its task, a complexity, `simple`, `moderate` or `complex`, a slug, a summary of
  one sentence, a description in Markdown, and the ids of the earlier tickets of the task that it depends on. The
  complexity will select the model that does the ticket.
- A ticket is the work of one agent in one session, which ends in one commit that passes the checks. Its description
  holds everything that an agent needs to do it in a fresh context, with the decisions of the design that it
  implements quoted in full.
- `saveTickets` replaces the whole list of tickets of a task, and numbers them from 1 in their order. A ticket depends
  only on earlier tickets, so the list has no cycles. `getTask` returns the tickets too.
- The phase of a task becomes its status: `plan-goals`, `plan-design`, `plan-tickets` or `complete`. Step 5 of the
  schema rebuilds the table `task` with it, and adds the tables `ticket` and `ticket_dependency`.
- `setStatus` replaces `completeGoals` and `completeDesign`. Each skill sets the status to its stage when it starts,
  so the status names the stage the user works on, and can move back. `plan-design` needs goals, `plan-tickets` a
  design too, and `complete` tickets too.
- `saveGoal`, `deleteGoal`, `saveDesign` and `saveTickets` work in every status but `complete`, which freezes the plan.
  A change to one part rewrites the later parts that it affects: goals, then design, then tickets. A goal that comes
  up in a later stage is stored as a goal.
- The slug of a task and of a ticket is exactly three words.
- A goal has an id from 1 within its task too, which is the number the user sees. Deleting a goal moves each later
  goal down by one, so the ids stay 1 to n. Step 5 rebuilds the table `goal` with them.
- The rules that every stage shares sit in `plugin/references/planning.md`, which each skill reads first.
- `PROTOCOL_VERSION` is 10, since the session server offers tools that an older repository server lacks.

Rejected:

- Methods to add, edit and delete one ticket. A new split rewrites the list anyway, and no ticket has run yet, so
  stable ids buy nothing.
- The dependencies as a JSON column of the ticket. A table lets foreign keys check them.

## Phase 13

Each method leads with its domain, so the methods of one domain sort together in lists of tools and of files. The
phases above keep the names they shipped with.

- `sessionRegister`, `sessionList`, `messageLog`, `messageList`, `messageDeliver`, `subagentStart`, `subagentStop`,
  `subagentEnd`, `subagentFollow`, `inboxAwait`, `inboxAwaitCommand`, `taskGet`, `taskCreate`, `taskSetStatus`,
  `goalSave`, `goalDelete`, `designSave` and `ticketsSave`. `echo` has no domain and keeps its name.
- `ticketsSave` is plural, since it replaces the whole list. `inboxAwaitCommand` returns the command that waits on an
  inbox.
- `sessionList` replaces `listAttachedSessions`. It returns the attached sessions first, then the registered ones
  that are not attached, each with a flag `attached`. `attached: true` returns only the attached ones, which is what
  the web UI asks for, and `attached: false` only the others.
- The files of the methods carry the new names, such as `method.task-get.ts`.
- `PROTOCOL_VERSION` is 11, since every method has a new name.

Rejected:

- Names such as `task.get` or `task/get`. Agents see the methods as tools, and a tool name allows no dot or slash.

## Phase 14

`/atomic-workflow:plan [task id] [prompt]` runs the three stages of planning in order. Without a task id, it starts
with `plan-goals`. With a task id, it resumes at the stage that the status of the task names.

- Each stage skill finishes by naming the next stage, and `/atomic-workflow:plan` invokes it with the Skill tool in
  the same reply, until the status of the task is `complete`.
- The stage skills drop `disable-model-invocation`, since a skill that only the user can invoke cannot be invoked by
  another skill. Their descriptions now sit in the context of every session.

Rejected:

- Reading the `SKILL.md` of each stage and following it. The stage skills would get no arguments, and their
  `allowed-tools` would not apply.

## Phase 15

`/atomic-workflow:tasks` lists the tasks of the repository, and `/atomic-workflow:tasks-delete <task id | task slug>`
deletes one of them.

- `taskList` returns every task without its plan: its id, slug, status, creation time, and its numbers of completed
  and uncompleted tickets. Tickets have no completion yet, so each ticket counts as uncompleted.
- `taskDelete` deletes a task with its goals, its design and its tickets, in any status. Ids of deleted tasks are not
  reused.
- Agents see both methods as tools, since the skills call them.
- `/atomic-workflow:tasks-delete` takes an id, a slug, or both as `/atomic-workflow:tasks` prints them. Slugs are not
  unique, so a slug that several tasks share asks for the id.
- `PROTOCOL_VERSION` is 12, since the session server offers tools that an older repository server lacks.

## Phase 16

A ticket says who does its work, so a ticket can be any work: code, research, moving files, a debugging cycle, or
steps that only the user can take, such as paying for a hosting service.

- A ticket has a mode: `unattended` for an agent alone from start to finish, `attended` for an agent that needs the
  user between turns, and `manual` for the user, whom an agent guides and whose work it checks. The mode will decide
  which tickets run in parallel and which ones wait for the user.
- A `manual` ticket has no complexity, since no agent does it, and every other ticket has one. `ticketsSave` and a
  `CHECK` of the table both enforce it.
- A ticket is done when its acceptance criteria hold. It ends in a commit only if it changes the repository.
- A description may have a section `## Outputs`, which names each result that a later ticket reads and where it goes,
  such as the file of the findings of a research ticket. A secret goes to an environment variable or a secret store,
  and `## Outputs` names only where it goes.
- The planner orders each `manual` ticket as early as its dependencies allow, so the user does their part first.
- Step 6 of the schema rebuilds the table `ticket` with the column `mode`, and gives each existing ticket the mode
  `unattended`.
- `PROTOCOL_VERSION` is 13, since `ticketsSave` takes parameters that an older repository server lacks.

Rejected:

- A kind of work, such as `research`, `code` or `debug`. It changes nothing in how a ticket runs, and the description
  already says what the work is. It joins the ticket once a kind changes how a ticket runs.
- Values of a `manual` ticket, such as tokens, in the database. It is plain text on disk, and the web UI and the
  methods reach it.

## Phase 17

The design of a task reads like a section of this README instead of a list of decisions, so that whoever implements
the task, and whoever reviews its pull request, can read it with no other context.

- The design opens with a title and a paragraph in plain words: what changes for the people who use the result, and
  why. `## Goals` lists the goals. One section per area of the work states its choices concretely, with their
  reasons. `## Rejected` and `## Objections` close it.
- The design describes the result, never the conversation that produced it.
- The user names a section by its heading to change it. Sections replace the numbered decisions.
- An objection that the user overrode goes to `## Objections` of the design. A ticket quotes the sections of the
  design that it implements in `## Design`, in place of `## Decisions`.
- Only the instructions of the agent change. The design stays one Markdown text.

Rejected:

- A list of decisions, each with its choice, its reason and its rejected alternatives. It reads like a log, and a
  reader has to put the plan together from it.
- The mapping from goals to decisions in the design. The agent checks that every goal has a section that meets it, and
  the reader sees the goals and the sections side by side.

## Layout

```
plugin/                           the plugin, and the local marketplace that holds it
  .claude-plugin/plugin.json      manifest of the plugin
  .claude-plugin/marketplace.json local marketplace, with the plugin at its root
  .mcp.json                       the session server
  hooks/hooks.json                the hook that resumes the messages of a session after `/clear`
  skills/atomic-workflow/SKILL.md
  skills/plan/SKILL.md            every stage of planning, in order
  skills/tasks/SKILL.md           the list of the tasks
  skills/tasks-delete/SKILL.md    the deletion of a task
  skills/plan-goals/SKILL.md      the first stage of planning, which settles the goals of a task
  skills/plan-design/SKILL.md     the second stage of planning, which settles the design of a task
  skills/plan-tickets/SKILL.md    the last stage of planning, which splits the design of a task into tickets
  references/planning.md          the rules that every stage of planning shares
  agents/worker.md                the subagent that carries out the messages of the repository server
  dist/                           bundles, built by `npm run build` and committed
mcp/                              the MCP project: sources, configs and build
  src/                            sources of both servers and the command line tool
    session-server.main.ts        entry point of the session server
    repository-server.main.ts     entry point of the repository server
    cli.main.ts                   entry point of the command line tool, which calls one method
    await-command.main.ts         entry point of the command line tool that waits for the messages of a session
    session-start.main.ts         entry point of the hook that resumes the messages of a session after `/clear`
    attachment/                   the pipe between clients and the repository server: address, attach, serve,
                                  hello, the connections of the bound sessions, the subagents and the inboxes
    rpc/                          JSON-RPC 2.0: messages, connection, dispatch, and the methods
    launch/                       start of a process outside the process tree of the caller
    storage/                      persistent data: the stores, their SQLite implementations and the database file
    transcript/                   the transcript of a session: find it, follow it, and log its messages
    web/                          the web server of the repository server
  scripts/build.main.ts           builds plugin/dist/
```

## Development

- Run `npm` and `npx` in `mcp/`.
- `npm run build` bundles `plugin/dist/`. `npm run typecheck` and `npx biome ci` check the sources.
- `claude --plugin-dir ./plugin` runs a session with the plugin loaded from the working copy.
- `node src/cli.main.ts echo '{"message":"Hi"}'` calls a method on the running repository server of the repository.
