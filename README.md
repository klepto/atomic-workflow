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

## Layout

```
plugin/                           the plugin, and the local marketplace that holds it
  .claude-plugin/plugin.json      manifest of the plugin
  .claude-plugin/marketplace.json local marketplace, with the plugin at its root
  .mcp.json                       the session server
  skills/atomic-workflow/SKILL.md
  agents/worker.md                the subagent that waits for the commands of the repository server
  dist/                           bundles, built by `npm run build` and committed
mcp/                              the MCP project: sources, configs and build
  src/                            sources of both servers and the command line tool
    session-server.main.ts        entry point of the session server
    repository-server.main.ts     entry point of the repository server
    cli.main.ts                   entry point of the command line tool, which calls one method
    attachment/                   the pipe between clients and the repository server: address, attach, serve,
                                  hello, the connections of the bound sessions and the subagents
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
- `claude --dangerously-load-development-channels plugin:atomic-workflow@atomic-workflow` runs a session that receives
  delivered messages, with the plugin installed from its local marketplace.
- `node src/cli.main.ts echo '{"message":"Hi"}'` calls a method on the running repository server of the repository.
