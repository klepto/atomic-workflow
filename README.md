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
  subagents (`isSidechain`) and summaries of a compaction are no messages. The format is internal to Claude Code, so
  the session server reads only the fields that it needs, and skips a line that it does not understand.
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

## Ideas

Findings for later phases. Nothing here is built yet.

### Deliver messages to a session

The repository server calls a new method `deliver` on the session server of the target session, and the session
server puts the message into the chat. The JSON-RPC 2.0 connection already carries requests in both directions.

- `hello` takes the session id beside the role, so that the repository server can send a message to the connection of
  one session.
- The session server answers `deliver` through the list of methods that it passes to `dispatch`, which is empty today.
- Preferred way into the chat: a channel. The MCP server declares the experimental capability `claude/channel` and
  sends the notification `notifications/claude/channel` with the message. The agent sees it as a new event, also while
  the session is idle. Channels are a research preview, need the flag `--channels`, and a plugin outside the allowlist
  needs `--dangerously-load-development-channels`. The names are from memory: check the docs first.
- Fallback: a command `watch` of the command line tool connects to the repository server and prints one line per
  message. The agent starts it once with the Monitor tool, and each line wakes the agent. It only uses stable
  features, but it needs one more process, and the agent must start it.
- Delivered messages land in the transcript, so the log of phase 4 has them without more work.

Rejected:

- Hooks that poll on `UserPromptSubmit` or `Stop`. They only deliver at the boundaries of a turn, so an idle session
  never sees the message.
- `CLAUDE_CODE_MESSAGING_SOCKET` and the inbox tools of Claude Code. Their protocol is internal and not documented.

## Layout

```
plugin/                           the plugin, and the local marketplace that holds it
  .claude-plugin/plugin.json      manifest of the plugin
  .claude-plugin/marketplace.json local marketplace, with the plugin at its root
  .mcp.json                       the session server
  skills/atomic-workflow/SKILL.md
  dist/                           bundles, built by `npm run build` and committed
mcp/                              the MCP project: sources, configs and build
  src/                            sources of both servers and the command line tool
    session-server.main.ts        entry point of the session server
    repository-server.main.ts     entry point of the repository server
    cli.main.ts                   entry point of the command line tool, which calls one method
    attachment/                   the pipe between clients and the repository server: address, attach, serve and
                                  hello
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
