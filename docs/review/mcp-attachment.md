# Review of mcp-attachment

Paths: `mcp/src/attachment/`, `mcp/src/launch/`

The area is the pipe between the clients and the repository server, plus the in-memory state that the repository server
keeps per connection. `repository-address` derives the named pipe or Unix socket from the common git directory. `attach`
connects, launches a repository server through `launch` when none answers, and says `hello`. `serve-repository` listens,
counts session servers, ends with the last one, and defines `hello` and `bindSession`. `launch` starts the repository
server through a short-lived launcher process. The in-memory services are `inboxes`, `session-connections`, `subagents`,
`ticket-claims` and `session-activity`, each an interface module with a `.map.ts` adapter. `await-command-line` builds
the command line of the wait. The code is small, consistent and well documented: every exported member has a doc
comment, and no function is long. The main weaknesses are the start and the end of a repository server: an error after
`listen` leaves it listening with closed storage, and its listener closes when the session count hits zero, but a
connection that says hello a moment later still attaches, so two repository servers can serve one repository. Smaller
problems: inboxes stay tied to the first connection of their session, and the launched process loses its output. The
launch without a working directory is recorded with its main cause as mcp-entry-1. On the structure side, the transport
adapter holds two RPC methods, clients fake a `launch` to attach without launching, and some timers sit outside a seam.

### mcp-attachment-1. A session server that says hello after the last session left attaches to a closing repository server

- Kind: bug
- Severity: major
- Location: `mcp/src/attachment/serve-repository.socket.ts`, `serve` (close handler, line 93) and `socketServeRepository` (first attach timer, line 74); `mcp/src/attachment/hello.ts`, `helloMethod` (line 61)
- Problem: When the session count drops to 0, the close handler calls `repository.server.close()`. That call stops the listener, but it keeps every connection that is open. A session server whose connection was accepted just before, but whose `hello` arrives just after, still runs `attachSession`. That raises `sessions` to 1, so the old process lives on as long as that session. The old process no longer listens on the address. The next session server that activates fails to connect, launches a second repository server, and attaches to it. Two repository servers then serve one repository. Each has its own inboxes, session connections and ticket claims. Messages from one web UI cannot reach the sessions of the other. Two sessions can claim the same ticket, which breaks the README rule "two sessions never work on one ticket" (Phase 0: "two launches at the same time leave one repository server"). The first attach timer has the same window: it closes the server at 10 s even when a session hello is in flight. To reproduce: attach session A only. Exit A while session B runs `/atomic-workflow`, so that B's connection is accepted before A's socket closes. To hit the window every time, add a 200 ms delay in `helloMethod` before `attachSession`. Then activate session C: C reports "Started the atomic-workflow server.", and `sessionList` on C's web UI does not show B.
- Fix: Mark the repository as closing when the listener closes. From then on, `hello` in the role `session` fails with a distinct RPC error and ends the connection. `socketAttach` takes that error like a failed connect: it launches a repository server and connects again. A session server then never attaches to a repository server that no longer listens, and one repository server serves the repository at any time.
- Status: resolved by ticket 17

### mcp-attachment-2. An inbox that a session keeps across a rebind still closes with its first connection

- Kind: bug
- Severity: minor
- Location: `mcp/src/attachment/inboxes.map.ts`, `open` (line 77); `mcp/src/attachment/bind-session.ts`, `bindSessionMethod` (line 45)
- Problem: `bindSession` of session X on connection C2 moves X to C2 in the session connections. It then calls `inboxes.open(X, C2.closed)`. When X already has an inbox from connection C1, `open` returns at once. The inbox keeps the `closed` handler of C1, so it closes when C1 closes, although C2 serves X now. The wait of X then ends with `stop` and tells the agent not to wait again, and `messageDeliver` to X fails. To reproduce: resume the same session in a second terminal while the first one runs, activate both, then close the first terminal.
- Fix: Tie the close of an inbox to the connection that serves its session now. One option is to let `open` replace the `closed` handler of an inbox that it keeps. Another is to close inboxes from the session connections when a connection's last binding goes away.
- Status: deferred: minor bug, left for a later task

### mcp-attachment-3. Two repository servers that reclaim a stale Unix socket at once can both listen, and the loser unlinks the winner's socket

- Kind: bug
- Severity: minor
- Location: `mcp/src/attachment/serve-repository.socket.ts`, `listenReclaiming` (lines 111-118)
- Problem: Only on Unix, after a crash has left the socket file behind. Two repository servers that start at once both get `EADDRINUSE` and both find the address not served. A removes the file and listens. B then removes A's file and listens on a new one, so A is unreachable. A's first attach timer closes A after 10 s. libuv unlinks the path of a listening pipe on close, which removes B's socket file as well. New session servers then launch a third repository server while B still serves its sessions. The result is the split of mcp-attachment-1.
- Fix: Reclaim under exclusion. For example, bind a temporary path and `rename` it over the address, or check after `listen` that the path still holds this server's socket. Never close a server whose socket path was taken over without first dropping its path.
- Status: deferred: minor bug, left for a later task

### mcp-attachment-4. An error after listen leaves a repository server that listens with closed storage, or crashes it

- Kind: bug
- Severity: major
- Location: `mcp/src/attachment/serve-repository.socket.ts`, `socketServeRepository` (lines 72-74) and `listenCatching` (line 128); the caller is `mcp/src/repository-server.main.ts`, `serve` and `main`
- Problem: Two error paths fail after `listen`. First: if `dependencies.listening` rejects (`tasks.endRuns(Date.now())` in `repository-server.main.ts`, for example with a SQLite `database is locked` past the 5 s busy timeout), `socketServeRepository` rejects while the server still listens, and the first attach timer was never set. `repository-server.main.ts` then closes the web server and the storage, and sets the exit code. The listening handle keeps the process alive, so session servers still attach to it. `hello` returns the URL of a closed web server, and every method fails on closed storage. If no session attaches, the process never ends. To reproduce: make `listening` throw (for example make `endRuns` reject), start a session and call `activate`, then run `node src/web-url.main.ts` and open the URL, and call `taskList` from the session. The web UI does not answer and `taskList` fails. Second: `listenCatching` removes its `error` listener once the server listens. A later `error` event of the server, such as `EMFILE` on accept, then has no listener and crashes the process with all its in-memory state.
- Fix: When `listening` or anything after the listen fails, the repository server stops listening on the address before it closes the web server and the storage, and the process ends with exit code 1. The next `activate` then launches a fresh repository server. A permanent `error` listener on the server logs a later error, and the server keeps serving.
- Status: resolved by ticket 18

### mcp-attachment-5. waitForAttach ignores a signal that has already aborted, and never removes its abort listener

- Kind: bug
- Severity: minor
- Location: `mcp/src/attachment/subagents.map.ts`, `waitForAttach` (lines 61-67)
- Problem: `addEventListener('abort')` on a signal that has already aborted never fires. The wait then settles only on attach or stop, against the contract "If ... `signal` aborts first, rejects". The listener also stays on the signal after the subagent attaches. No caller passes an aborted signal today: `subagent-start` passes a fresh `AbortSignal.timeout`.
- Fix: Reject at once when `signal.aborted`, and remove the listener once `attached` settles. Or use `AbortSignal.any` with `signal.throwIfAborted()`.
- Status: deferred: minor bug, left for a later task

### mcp-attachment-6. The launched repository server writes its output nowhere

- Kind: design
- Severity: minor
- Location: `mcp/src/launch/launch.detached.ts`, `LAUNCHER_SCRIPT` (`stdio: 'ignore'`)
- Problem: The repository server runs with `stdio: 'ignore'`. Everything it writes to the standard error is lost: the stack of a failed start in `repository-server.main.ts`, a schema step that failed, `EADDRINUSE`. The session server only reports "The repository server at ... did not come up: connect ENOENT" after 5 s. This makes failures of the repository server impossible to diagnose.
- Fix: Let `LaunchFunction` take a log file, open it in the launcher, and pass it as `stdout` and `stderr` of the program. For example, use a file per repository next to the database. Name the file in the attach error.
- Status: kept: a log file for the launched repository server changes the behavior of the launch, and this cleanup changes none; a later task can add it

### mcp-attachment-7. Clients that must not launch a repository server fake a launch that rejects

- Kind: design
- Severity: minor
- Location: `mcp/src/attachment/attach.ts`, `AttachDependencies.launch`; callers `mcp/src/cli.main.ts`, `mcp/src/web-url.main.ts`, `mcp/src/await-command.main.ts`, `mcp/src/session-start.main.ts`, `mcp/src/session-activity.main.ts`
- Problem: `launch` is mandatory, so all five client entry points pass `() => Promise.reject(...)`. Two of them add a sentinel error (`NO_SERVER`) and an `attachCatching` wrapper to tell "no server" from a real failure. All five also pass the same `handle: (message) => Dispatch([], undefined, message)`. Every connect error (`EACCES`, `ECONNREFUSED` on a stale socket) is also reported as "no server", so the real cause is lost.
- Fix: Make `launch` optional. Without it, `Attach` rejects with an exported error class (for example `NoRepositoryServerError`) that carries the connect error as `cause`. Default `handle` to a dispatch over no methods. Move the shared client attach into one helper of the area.
- Status: resolved by ticket 8

### mcp-attachment-8. Timers and the clock of the in-memory inboxes sit outside a seam

- Kind: design
- Severity: minor
- Location: `mcp/src/attachment/inboxes.map.ts`, `deliver` (`setTimeout`, `BATCH_DELAY`) and `awaitOpen` (`setTimeout`); `mcp/src/attachment/attach.socket.ts`, `socketAttach` and `connectUntil` (`Date.now()`, `sleep`, fixed `CONNECT_TIMEOUT`, `HELLO_TIMEOUT`); `mcp/src/attachment/serve-repository.socket.ts`, `socketServeRepository` (`setTimeout`, fixed `FIRST_ATTACH_TIMEOUT`)
- Problem: `inboxes.map.ts` is pure in-memory logic, but it calls `setTimeout` directly. A test of the 500 ms batch or of `awaitOpen` must wait in real time. The socket adapters read the clock and fix their timeouts as module constants, so a test cannot shorten them.
- Fix: Pass a clock or timer service, with `setTimeout` and `now`, into `mapCreateInboxes`. Take the timeouts of attach and serve as options with the current values as defaults.
- Status: kept: the timers belong to the adapters that own them: the batch and the open wait of `inboxes.map.ts` are part of its in-memory state, and the timeouts of attach and serve are part of the socket transport, which a test replaces whole through `AttachFunction` and `ServeRepositoryFunction`. `connectUntil` no longer reads the clock, and stops on an `AbortSignal.timeout` instead

### mcp-attachment-9. The socket adapter defines the RPC methods hello and bindSession

- Kind: structure
- Severity: minor
- Location: `mcp/src/attachment/serve-repository.socket.ts`, `helloMethod`, `bindSessionMethod`
- Problem: The transport adapter holds protocol checks and business logic: the version check, the binding of sessions, and the move and open of inboxes. Every other method lives in `mcp/src/rpc/method.*.ts`. A second transport would have to copy these methods, and readers do not find them with the other methods. The schemas sit in separate modules again (`hello.ts`, `bind-session.ts`).
- Fix: Move `hello` and `bindSession` to `mcp/src/rpc/method.hello.ts` and `mcp/src/rpc/method.bind-session.ts` with their schemas. Pass the per-connection state (`attachSession`, the session flag) through the method context. Keep only listening and session counting in the socket adapter.
- Status: resolved by ticket 8

### mcp-attachment-10. The connect probe is written twice

- Kind: structure
- Severity: minor
- Location: `mcp/src/attachment/attach.socket.ts`, `connectCatching`; `mcp/src/attachment/serve-repository.socket.ts`, `isServed`
- Problem: Both functions open `createConnection(address)` and race `error` against `connect`. `isServed` is `connectCatching` followed by `destroy`.
- Fix: Keep one `connectCatching` in a shared socket module of the area, and build `isServed` on it.
- Status: resolved by ticket 8

### mcp-attachment-11. The attachment folder mixes the pipe with unrelated in-memory state

- Kind: structure
- Severity: minor
- Location: `mcp/src/attachment/ticket-claims.ts`, `ticket-claims.map.ts`, `session-activity.ts`, `session-activity.map.ts`, `await-command-line.ts`, `await-command-line.shell.ts`
- Problem: The README Layout says `attachment/` is "the pipe between clients and the repository server: address, attach, serve, hello, the connections of the bound sessions, the subagents and the inboxes". Ticket claims, agent activity and the wait command line are not part of the pipe, and the Layout does not list them. Readers cannot tell from the folder where session state lives.
- Fix: Move the in-memory session state (`inboxes`, `session-connections`, `subagents`, `ticket-claims`, `session-activity`) to a folder of its own, such as `mcp/src/sessions/`. Keep only address, attach, serve, hello and bindSession in `attachment/`. Move `await-command-line` next to the other code of the wait. Update the Layout.
- Status: kept: moving the session state out of `attachment/` changes the paths of the areas of the design, and edits importers in `rpc/`, `changes/` and `transcript/`, whose cleanups run in parallel or later. The README Layout now names every part of `attachment/` instead

### mcp-attachment-12. Default implementations are PascalCase function constants

- Kind: style
- Severity: minor
- Location: `mcp/src/attachment/attach.ts`, `Attach`; `await-command-line.ts`, `AwaitCommandLine`; `inboxes.ts`, `CreateInboxes`; `repository-address.ts`, `RepositoryAddress`; `serve-repository.ts`, `ServeRepository`; `session-activity.ts`, `CreateSessionActivity`; `session-connections.ts`, `CreateSessionConnections`; `subagents.ts`, `CreateSubagents`; `ticket-claims.ts`, `CreateTicketClaims`; `mcp/src/launch/launch.ts`, `Launch`
- Problem: Function values are named in PascalCase, which reads as a class or a type and conflicts with common lint naming rules (Biome `useNamingConvention`). The adapters are camelCase (`socketAttach`, `mapCreateInboxes`), so one function carries two casings. Constants such as `PROTOCOL_VERSION` and `CLAIM_OUTCOMES` add a third convention, which is fine but should be stated.
- Fix: Settle one rule in the code style, for example camelCase for every function value (`attach`, `createInboxes`, `launch`) and UPPER_SNAKE only for literal constants and schemas. Rename across the area and its callers.
- Status: resolved by ticket 8

### mcp-attachment-13. The in-memory adapters and the catching helpers have different shapes

- Kind: style
- Severity: minor
- Location: `mcp/src/attachment/ticket-claims.map.ts`, `mapCreateTicketClaims`; `mcp/src/attachment/session-activity.map.ts`, `reported` and `UNREPORTED`; `mcp/src/attachment/attach.socket.ts`, `connectCatching`; `mcp/src/attachment/serve-repository.socket.ts`, `listenCatching`
- Problem: Each `.map.ts` adapter delegates to module-level functions, except `ticket-claims.map.ts`, which writes all its logic inline in the returned object. `reported` puts a default parameter (`current = UNREPORTED`) before required ones, which Biome flags (`useDefaultParameterLast`). The `UNREPORTED` constant sits between functions after its first use. The two "catching" helpers use opposite conventions: `connectCatching` returns `Socket | Error`, and `listenCatching` returns `ErrnoException | undefined`.
- Fix: Give `ticket-claims.map.ts` module-level `claim`, `isHeldByOther` and `release`. Make `current` of `reported` a required `ReportedActivity | undefined` defaulted inside the body. Move `UNREPORTED` up to the other constants. Pick one result convention for helpers that catch, and apply it to both.
- Status: resolved by ticket 8

### mcp-attachment-14. Some contracts miss errors or describe the behavior wrongly

- Kind: docs
- Severity: minor
- Location: `mcp/src/attachment/serve-repository.ts`, `ServeRepositoryFunction`; `mcp/src/attachment/attach.ts`, `AttachFunction`; `mcp/src/attachment/repository-address.ts`, `RepositoryAddressFunction`; `mcp/src/attachment/inboxes.ts`, `Inboxes.open`; `mcp/src/attachment/subagents.ts`, `Subagents.start`
- Problem: Five contracts are incomplete or wrong. `ServeRepositoryFunction` says it "resolves when the last session server that attached to it leaves". In fact it resolves once the listener is closed and every open connection has ended, clients included. It does not say that it rejects when `listening` rejects. `AttachFunction` does not say that it rejects with the error of `launch`. `RepositoryAddressFunction` names only "not in a repository" as an error. It also rejects when git is missing or older than 2.31, which lacks `--path-format`. `Inboxes.open` does not say that a kept inbox still closes with the `closed` it was first opened with (see mcp-attachment-2). `Subagents.start` does not say that starting a started session id replaces it without rejecting the waits on the old one. None of the docs use tags for parameters, return value and errors, so the coverage of goal 5 cannot be checked mechanically.
- Fix: Correct the five contracts. Apply the doc comment format that the code style settles (for example `@param`, `@returns`, `@throws`) to every exported member of the area.
- Status: resolved by ticket 8
