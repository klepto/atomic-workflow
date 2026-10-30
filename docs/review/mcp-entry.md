# Review of mcp-entry

Paths: `mcp/src/*.main.ts`, `mcp/src/web/`, `mcp/scripts/`, `plugin/hooks/`

The area holds the process entry points of the MCP project and what runs them: the session server (the MCP server of one
Claude Code session, which attaches to the repository server on `activate`, offers one tool per agent method, binds and
logs the session transcript, and logs subagents), the repository server (which wires the stores, the change feed, the
web server and the socket server), three command line tools (`cli`, `web-url`, `await-command`), two hooks
(`session-start` after `/clear`, and `session-activity` on `Stop`, `Notification` and `PreToolUse`), the HTTP web server
with its static files, and the esbuild script that bundles `plugin/dist/`. The code is careful and well commented. The
static files refuse path traversal correctly (decoded once, `..` above the root, `\`, `:` and NUL refused), the HTTP
server checks the host, requires `application/json` on `/rpc`, unsubscribes each event stream on close and closes every
connection on stop, and the hooks are bounded by their timeouts. The main problems are a repository server tied to the
worktree that launched it (a failed start that leaves the server listening is recorded as mcp-attachment-4, where its
cause lies), a session server whose log stops for good after one failure, and a 457-line session-server entry point that
holds most of the session logic where no test can import it. Smaller issues are duplicated client and hook boilerplate,
sibling entry points found by string replacement, and docs that omit the activity hooks and the errors of the web
interfaces.

### mcp-entry-1. The repository server runs from, and holds, the directory of the session that launched it

- Kind: bug
- Severity: major
- Location: `mcp/src/repository-server.main.ts`, `main`, line 49 (`findMainWorktree(values.directory, ...)`), and `serve`, line 86 (`createWorktrees(...)`); `mcp/src/session/activate.ts`, `attach`, line 64 (launch without a working directory); `mcp/src/launch/launch.detached.ts`, `detachedLaunch` (line 20) and `LAUNCHER_SCRIPT` (line 8), which spawn both processes without a `cwd`
- Problem: The repository server gets `--directory` from the project directory of the first session that activates, and README phase 25 says it can start in any worktree. It passes that directory to `CreateWorktrees`, whose `layoutOf` runs `git worktree list` with that directory as working directory on every operation. The launcher also starts the server without a `cwd`, so the server process inherits the working directory of the session server, which is that same directory. When the directory is a task or ticket worktree, removing that worktree later breaks the server: on Windows the removal of the directory fails because the repository server process holds it as its working directory, and elsewhere the removal succeeds and every later worktree method fails, since git runs in a directory that no longer exists. To reproduce on Windows: with no repository server running, start `claude` in the worktree directory of task N and run `/atomic-workflow`; start a second session in the main checkout and activate it; end the first session; from the second session delete or land task N. The directory of the worktree stays behind with a failure sentence about a directory that another program holds.
- Fix: The repository server works from the main worktree that it already finds at start: it passes `mainWorktree` to `CreateWorktrees`, and runs with the main worktree as its working directory (set by the launch or by `process.chdir` at start). Removing any task or ticket worktree then works while the server runs.
- Status: resolved by ticket 19

### mcp-entry-2. One failure stops the log and the binding of the session until the next attach

- Kind: bug
- Severity: minor
- Location: `mcp/src/session/follow-sessions.ts`, `followSessions` and `followCurrentSession`, lines 15-63
- Problem: Any rejection inside the follow loop (a failed `bindSession`, a `messageLog` request that the repository server rejects, or a read error of the transcript file in `tailFile`) ends `followSessions` for good with one line on the standard error. The connection and the tools stay, and `session.transcript` keeps the last transcript, so `listSkills` and `followSubagent` keep answering for it. The session is no longer logged, and after `/clear` the new session is never bound, so its inbox does not move and the `SessionStart` hook prints nothing. Nothing tells the agent or the user, and only a new attach recovers.
- Fix: Retry the follow after a delay while the connection is open, or close the attachment on a failure so that the next `activate` starts clean; clear `session.transcript` when the follow ends.
- Status: deferred: minor bug, left for a later task

### mcp-entry-3. The activity hooks stamp their status with the time it reaches the server

- Kind: bug
- Severity: minor
- Location: `mcp/src/client/report-activity.ts`, `reportActivity`, line 32 (the parameters without `at`); `mcp/src/session-activity.main.ts`, `main`, line 21; `plugin/hooks/hooks.json`, `Stop`, `Notification` and `PreToolUse` hooks
- Problem: The hooks run with `async: true` and send `sessionActivityReport` without `at`, so the repository server stamps the status with the time of arrival, which is the hook start plus the start of Node, `git rev-parse` and the attach (often several hundred ms on Windows). The transcript log reports `working` with the time of the transcript line. When a new turn starts before a late `idle` from `Stop` arrives, such as a background wait that ends right at the end of a turn, the late `idle` is newer than the `working` and wins, and the web app shows the session idle until a later read of the transcript reports `working` again. A late `waiting` after a quickly answered permission prompt has the same effect.
- Fix: Read the time once at the start of the hook process and send it as `at`, so the order of the reports follows the order of the events.
- Status: deferred: minor bug, left for a later task

### mcp-entry-4. The wait command finds the repository from the working directory of the shell that runs it

- Kind: bug
- Severity: minor
- Location: `mcp/src/await-command.main.ts`, `main`, line 31 (`attachClient(process.cwd(), ...)`)
- Problem: The command line that the agent runs in the background names only the session, and the tool resolves the repository server from `process.cwd()`. The agent runs it in its shell, whose working directory moves with each `cd`. If the shell is outside the repository at that moment, such as in a scratch directory or in another repository among the working directories of the session, the wait fails or reaches the wrong repository server, prints "Do not run the wait command again", and the session stops receiving messages.
- Fix: Give the command line the address or the main worktree of the repository (for example `--directory <main worktree>`), so the wait reaches the same repository server from any working directory.
- Status: deferred: minor bug, left for a later task

### mcp-entry-5. The session-server entry point holds five purposes in 457 lines

- Kind: structure
- Severity: major
- Location: `mcp/src/session-server.main.ts`, whole file
- Problem: One file holds the MCP server setup and the `activate` tool (`main`, `activate`, `attachedMessage`, `waitInstruction`), the attach lifecycle and the tools that come and go with it (`attach`), the follow of the session transcript with its skill tracking (`followSessions`, `followCurrentSession`, `watchSkills`, `keepSkills`, `listSkills`), the subagent log (`followSubagent`, `logSubagent`), and the adapter from `Method` to MCP tool (`registerTool`, `callTool`, `text`, `failure`, `messageOf`). The mutable `Session` object is written from six of these functions. The `activate` tool is registered by hand next to the tools that come from `Methods`, with its own result helpers, so the two kinds of tools follow two models.
- Fix: Keep `session-server.main.ts` as a composition root of about 40 lines. Move the rest into modules of a `session/` directory, for example `session-attachment.ts` (attach lifecycle and `activate`), `follow-sessions.ts` (session follow and skills), `log-subagent.ts`, and `method-tools.ts` (the `Method`-to-tool adapter with `text` and `failure`).
- Status: resolved by ticket 12

### mcp-entry-6. Session-server and hook logic sits in entry modules with direct process side effects

- Kind: design
- Severity: major
- Location: `mcp/src/session-server.main.ts`, `attach` (line 256, `process.execPath`), `followSessions` (line 294, `process.stderr`), `logSubagent` (line 406, `process.stderr`), `main` (lines 169-171 and 200, `process.env`, `process.cwd`, `process.ppid`, `process.stdin`, `process.exit`); `mcp/src/session-start.main.ts`, `attachCatching` and `hookOutput`; `mcp/src/session-activity.main.ts`, `attachCatching`; `mcp/src/await-command.main.ts`, `report`, `messagesReport` and `quote`
- Problem: Each `*.main.ts` ends with a top-level `await main()`, so importing it runs the process. The attach lifecycle, the session follow, the subagent log, the hook output and the text of the wait report therefore cannot be imported by a test. `SessionDependencies` already injects most adapters, but the logic still writes to `process.stderr`, reads `process.execPath` for the launch command, and reads the environment and the parent process id directly.
- Fix: Move the logic into importable modules that take a logger (standard error), the launch command line and the session environment through their dependencies. Leave in the entry points only the reads of `process.*` and the wiring of the default adapters.
- Status: resolved by ticket 12

### mcp-entry-7. Five entry points repeat the client attach, and the two hooks repeat their input handling

- Kind: structure
- Severity: minor
- Location: `mcp/src/cli.main.ts`, `main`, lines 21-26; `mcp/src/web-url.main.ts`, `main`, lines 11-16; `mcp/src/await-command.main.ts`, `main`, lines 40-45; `mcp/src/session-start.main.ts`, `HOOK_INPUT`, `NO_SERVER`, `attachCatching`, lines 12-55; `mcp/src/session-activity.main.ts`, `HOOK_INPUT`, `NO_SERVER`, `attachCatching`, lines 13-63
- Problem: Each client builds the same `Attach(address, 'client', { launch: reject, openConnection: OpenRpcConnection, handle: (message) => Dispatch([], undefined, message) })` after `RepositoryAddress(...)`, and closes the connection in a `finally`. The two hooks also repeat the schema of the hook input, the `NO_SERVER` sentinel, `attachCatching`, the read of standard input, and `RepositoryAddress(process.env.CLAUDE_PROJECT_DIR ?? input.cwd).catch(() => undefined)` verbatim.
- Fix: Add one helper such as `attachClient(directory)` (and a variant that returns `undefined` when no server runs) next to `Attach`, and one `readHookInput()` for the hooks, and use them in all five entry points.
- Status: resolved by ticket 12

### mcp-entry-8. Sibling entry points are found by replacing a word in the file name

- Kind: structure
- Severity: minor
- Location: `mcp/src/session-server.main.ts`, `REPOSITORY_SERVER` and `AWAIT_COMMAND`, lines 38-50; `mcp/src/repository-server.main.ts`, `AWAIT_COMMAND` and `WEB_DIRECTORY`, lines 29-40; `mcp/scripts/build.main.ts`, `ENTRY_POINTS`, lines 24-30
- Problem: Three constants derive the path of another entry point with `basename(import.meta.filename).replace('<own name>', '<other name>')`, and one tells sources from bundle by the `.ts` extension. The scheme repeats in two files and only works while the bundle names in `ENTRY_POINTS` of the build script match the source names. Nothing ties the three files together, so renaming an entry point or a bundle breaks the launch or the wait command at run time only.
- Fix: Add one module that returns the path of a named entry point (`entryPoint('await-command')`) and of the web directory, for both the sources and the bundle, and let the build script take its bundle names from the same list.
- Status: resolved by ticket 12

### mcp-entry-9. The text of a failure is built eleven times in three forms

- Kind: structure
- Severity: minor
- Location: `mcp/src/await-command.main.ts`, line 105; `mcp/src/cli.main.ts`, line 36; `mcp/src/web-url.main.ts`, line 22; `mcp/src/session-start.main.ts`, line 75; `mcp/src/session-activity.main.ts`, line 67; `mcp/src/session-server.main.ts`, lines 451 and 455; `mcp/src/repository-server.main.ts`, line 112; `mcp/scripts/build.main.ts`, line 80; `mcp/src/web/start-web-server.http.ts`, lines 90 and 175
- Problem: Each place repeats `error instanceof Error ? error.message : String(error)`, some with `error.stack ?? error.message`. `session-server.main.ts` defines `messageOf` and still repeats the expression in its own top-level handler. The choice between the stack and the message has no stated rule.
- Fix: Add one shared `messageOf(error)` (and `detailOf(error)` with the stack for the long-running servers and the build) and use it everywhere; state the rule once.
- Status: resolved by ticket 12

### mcp-entry-10. Formatting slips that the current Biome configuration does not catch

- Kind: style
- Severity: minor
- Location: `mcp/src/session-server.main.ts`, `logSubagent`, lines 406-407; `mcp/src/repository-server.main.ts`, imports, lines 19-22, and the comment of `main`, line 46
- Problem: `logSubagent` ends a template literal with a raw line break instead of `\n`, unlike every other write to the standard error. The imports of `repository-server.main.ts` are not sorted (`stop-processes` before `main-worktree` and `worktrees`). The comment of `main` runs past the line width of 120. `npx biome ci` passes on the area only because the linter and the assist (import sorting) are disabled in `mcp/biome.json`.
- Fix: Use `\n` in `logSubagent`, sort the imports, wrap the comment, and enable the linter and `organizeImports` with the shared rules so that these slips fail the check.
- Status: resolved by ticket 12

### mcp-entry-11. One name with two meanings, and two names for one thing

- Kind: style
- Severity: minor
- Location: `mcp/src/session-server.main.ts`, `text`, line 436; `mcp/src/session-start.main.ts` and `mcp/src/session-activity.main.ts`, import of `text` from `node:stream/consumers`; `mcp/src/web/start-web-server.http.ts`, `serve`, line 88; `mcp/src/web/static-files.directory.ts`, `isFile`, line 142
- Problem: In the area, `text` is the stream consumer of Node.js in the hooks and the HTTP adapter, but a builder of a tool result in the session server. The caught value is named `failure` in two places and `error` everywhere else.
- Fix: Rename the session-server helper to `textResult` (and `failure` to `failureResult`), and name every caught value `error`.
- Status: resolved by ticket 12

### mcp-entry-12. The web adapters take their dependencies in a way of their own

- Kind: style
- Severity: minor
- Location: `mcp/src/web/start-web-server.http.ts`, `httpStartWebServer`, line 67; `mcp/src/web/start-web-server.ts`, `StartWebServer`, line 46; `mcp/src/web/static-files.ts`, `StaticFilesDependencies`, line 81
- Problem: `httpStartWebServer` is a curried factory that takes `createStaticFiles` and returns the `StartWebServerFunction`, while the other adapters of `mcp/` are plain values or take a dependencies object (such as `CreateWorktrees({ ... copyIgnored, stopProcesses })`). `StaticFilesDependencies` holds only a directory, which is a setting, not a dependency.
- Fix: Settle one injection style in the code style (for example a dependencies object as the last parameter), apply it to the web server, and name configuration values `options` rather than `dependencies`.
- Status: resolved by ticket 12

### mcp-entry-13. The exported web interfaces do not state their failures

- Kind: docs
- Severity: minor
- Location: `mcp/src/web/start-web-server.ts`, `StartWebServerFunction` and `WebServer.close`; `mcp/src/web/start-web-server.http.ts`, `httpStartWebServer`; `mcp/src/web/static-files.ts`, `StaticFiles.find` and `CreateStaticFilesFunction`; `mcp/src/web/static-files.directory.ts`, `directoryCreateStaticFiles`
- Problem: `StartWebServerFunction` rejects when the server cannot listen, `WebServer.close` rejects when the server fails to close, and `StaticFiles.find` rejects when `stat` fails with a code other than "no file" or when `readFile` fails, but no doc comment says so. `directoryCreateStaticFiles` has a one-line comment without its parameter or return value.
- Fix: Add the failure of each member to its doc comment, and the parameter and return value of `directoryCreateStaticFiles`.
- Status: resolved by ticket 12

### mcp-entry-14. The activity hooks and their entry point are not documented

- Kind: docs
- Severity: minor
- Location: `plugin/hooks/hooks.json`, `Stop`, `Notification` and `PreToolUse`; `mcp/src/session-activity.main.ts`; `README.md`, "Layout", lines 1157 and 1180-1187
- Problem: No phase of the README describes the hooks that report `idle` and `waiting`, which events and matchers they use, or why they are `async`. "Layout" still describes `hooks/hooks.json` as "the hook that resumes the messages of a session after `/clear`", and its list of entry points omits `session-activity.main.ts`.
- Fix: Add a README section for the activity hooks (events, matchers, `async`, what they report, and that the transcript reports `working`), and update "Layout" for `hooks.json` and `session-activity.main.ts`.
- Status: resolved by ticket 12

### mcp-entry-15. The comment on the repository-server process lifetime is incomplete

- Kind: docs
- Severity: minor
- Location: `mcp/src/repository-server.main.ts`, `main`, lines 42-47, and `serve`, lines 61-66
- Problem: The comments say that the process ends when the last session server leaves. They omit that it also ends when no session server attaches in its first 10 seconds, and that it ends only once every client connection (such as a running wait) has closed, since the net server waits for its connections. They also do not say what happens on a failure (exit code 1, message on the standard error that the detached launch discards).
- Fix: State the three ways the process ends and where its errors go.
- Status: resolved by ticket 12
