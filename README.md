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

The repository server serves a web UI, which only says hello world so far.

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
    web/                          the web server of the repository server
  scripts/build.main.ts           builds plugin/dist/
```

## Development

- Run `npm` and `npx` in `mcp/`.
- `npm run build` bundles `plugin/dist/`. `npm run typecheck` and `npx biome ci` check the sources.
- `claude --plugin-dir ./plugin` runs a session with the plugin loaded from the working copy.
- `node src/cli.main.ts echo '{"message":"Hi"}'` calls a method on the running repository server of the repository.
