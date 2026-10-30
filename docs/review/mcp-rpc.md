# Review of mcp-rpc

Paths: `mcp/src/rpc/`, `mcp/src/changes/`

`mcp/src/rpc/` holds the JSON-RPC 2.0 layer of both servers and every method: the message types and error class, a
zod dispatcher, the NDJSON connection over a byte stream, the registry of the 42 methods of the repository server and
the 3 methods of the session server, one file per method, and shared domain helpers (`open-task.ts`,
`open-ticket.ts`, `session-name.ts`, `slug.ts`). `mcp/src/changes/` holds the coalescing change feed and the wrappers
that make the stores and attachment services publish to it. The code is consistent in shape: each method is a
`Method` object with a zod schema and a long doc comment, and errors map to `RpcError`. Its main weaknesses are two
data-level bugs in the delete paths, methods that call other methods' `handle` as a domain library, much repeated
lookup and guard code, the clock and UUID read directly in ten handlers, and the reuse of JSON-RPC protocol error
codes for domain refusals.

### mcp-rpc-1. A forced task-wide `worktreeDelete` resets the tickets of a done or reopened task

- Kind: bug
- Severity: major
- Location: `mcp/src/rpc/method.worktree-delete.ts`, `worktreeDeleteMethod.handle` and `deleteTask`
- Problem: `handle` only checks that the task exists, with no status guard. A forced `deleteTask` then sets every ticket `not-started` and clears the base branch, whatever the task status and wherever the work of each ticket landed. On a `done` task, the call silently turns every `done` ticket into `not-started` while the task stays `done`. This breaks the README rule (Phase 19) that a done task refuses every change of its tickets, and it loses the review state for good: `ticketRequestChanges` and `worktreeCreate` then refuse the task. The same happens on a task that `ticketRequestChanges` reopened to `complete`: its earlier `done` tickets, whose commits are already on the base branch, go back to `not-started`, and `ticketNext` offers them again. Repro: land a task so it is `done`, then run `node src/cli.main.ts worktreeDelete '{"taskId":<id>,"force":true}'`, then `taskGet`: every ticket is `not-started`, the base branch is `null`, and the status is still `done`.
- Fix: Refuse a forced task-wide deletion on a `done` task with an invalid request, as other plan changes do. On other tasks, reset only the tickets whose work the deletion threw away: `in-progress` and `blocked` tickets, plus `needs-review` and `done` tickets whose commits the deleted task branch held but the base branch lacks. Tickets whose work is on the base branch keep their status.
- Status: resolved by ticket 21

### mcp-rpc-2. `taskDelete` and `sessionDelete` do not end a running subagent

- Kind: bug
- Severity: major
- Location: `mcp/src/rpc/delete-subagent.ts`, `deleteSubagent`; `mcp/src/rpc/method.task-delete.ts`, `deleteSubagents` and `taskDeleteMethod.handle`
- Problem: `deleteSubagent` only calls `subagents.stop` and `inboxes.close`, then deletes the session row. It never asks the orchestrator to stop the background task, which `stopSubagent` does. A one-shot subagent from `subagentCreate` has no inbox, so nothing ends it. An inbox subagent ends only after its current turn. The doc of `sessionDelete` says the subagent "is stopped first ... so the subagent ends", and `taskDelete` deletes "each subagent that works on it ... as `sessionDelete` does". `taskDelete` also removes the worktrees before it touches the subagents. Repro: start `/atomic-workflow:implement-all` on a task, then call `taskDelete` with `force: true` (or `sessionDelete` on the subagent) while a one-shot ticket subagent works. The subagent keeps editing files under the removed worktree path and calling tools, and its later `worktreeMerge` fails. Its transcript log then fails with "No session ... is registered", and its chat is gone from the web app.
- Fix: Stop each started subagent with `stopSubagent` before anything else, as `taskStop` does, so the orchestrator stops its background task. Then delete the worktrees, the task and the session rows. After the fix, a deleted subagent stops at once, the same as with `subagentStop`.
- Status: resolved by ticket 22

### mcp-rpc-3. `taskStop` misses a subagent that has started but not yet attached

- Kind: bug
- Severity: minor
- Location: `mcp/src/rpc/subagent-queries.ts`, `subagentsOfTask` and `attachedSubagent`; `mcp/src/rpc/stop-subagent.ts`, `stopSubagent`
- Problem: `subagentsOf` and `stopSubagent` look the subagent up in `subagents.list()`, which returns only attached subagents. During the up to 60 s that `startSubagent` waits for an orchestrator from `taskOrchestratorDeliver` to attach, `taskStop` does not stop it. The orchestrator then attaches and runs its command. The doc says the method stops "every started subagent".
- Fix: Also stop the started subagents that have not attached, for example with a `Subagents` query that lists all started subagents.
- Status: deferred: minor bug, left for a later task

### mcp-rpc-4. A failed subagent start leaves a registered session, or a running subagent behind a failure

- Kind: bug
- Severity: minor
- Location: `mcp/src/rpc/start-subagent.ts`, `startSubagent`; `mcp/src/rpc/method.subagent-create.ts`, `subagentCreateMethod.handle`
- Problem: Both paths call `sessions.register` before the steps that can fail. On a failure they stop the subagent, but the session row stays, so `sessionList` shows an orphan ended subagent (with its logged prompt for `subagentStart`). In `startSubagent`, the `subagentFollow` request after the attach has no error handling. When it rejects, for example because the parent session id changed after `/clear`, the method fails while the subagent stays attached and runs without a logged transcript. A caller such as `taskOrchestratorDeliver` from the web app may then retry and start a second orchestrator.
- Fix: Delete the registered session (and its logged prompt) on every failure path, and handle a failed `subagentFollow` the same way in both methods.
- Status: deferred: minor bug, left for a later task

### mcp-rpc-5. A non-forced task-wide `worktreeDelete` leaves tickets in progress whose branch it removed

- Kind: bug
- Severity: minor
- Location: `mcp/src/rpc/method.worktree-delete.ts`, `deleteTask`
- Problem: Without `force`, `deleteTask` returns at once after the removal and never resets ticket progress. `Worktrees.deleteTask` removes a ticket branch that holds no commits of its own, such as one that `worktreeCreate` just made. That ticket stays `in-progress` or `blocked` with its stage. README Phase 18 says "A ticket in progress or blocked whose branch it removes is `not-started` again."
- Fix: After any task-wide removal, set each `in-progress` or `blocked` ticket whose branch was removed to `not-started`, as `deleteTicket` does.
- Status: deferred: minor bug, left for a later task

### mcp-rpc-6. `goalDelete` can remove the last goal of a task past `plan-goals`

- Kind: bug
- Severity: minor
- Location: `mcp/src/rpc/method.goal-delete.ts`, `goalDeleteMethod.handle`
- Problem: `openTask` refuses only complete and done tasks. A task in `plan-design` or `plan-tickets` can lose its last goal and keep its status. `taskSetStatus` (`missingPart`) treats that state as invalid.
- Fix: Refuse to delete the last goal of a task whose status is past `plan-goals`, or set the task back to `plan-goals`.
- Status: deferred: minor bug, left for a later task

### mcp-rpc-7. A malformed error in a response crashes the process through an unhandled rejection

- Kind: bug
- Severity: minor
- Location: `mcp/src/rpc/rpc-connection.ndjson.ts`, `receive`, `settle`, `request`
- Problem: `receive` is called as `void receive(...)`. If the peer answers a pending request with `"error": null`, `settle` calls `RpcError.of(null)`, which throws a `TypeError`. The rejection is unhandled, and Node 24 then ends the process (no `unhandledRejection` handler exists in `mcp/src`). Also in `request`, if `send` throws (for example when `JSON.stringify` fails on the params), the promise rejects but the pending entry and the abort listener stay forever.
- Fix: Check that the error object of a response has a numeric `code` and a string `message`, and reject the pending request with a protocol error otherwise. Catch inside `receive`. In `request`, call `finish` when `send` throws.
- Status: deferred: minor bug, left for a later task

### mcp-rpc-8. Method handlers read the clock, random ids and timers directly

- Kind: design
- Severity: minor
- Location: `mcp/src/rpc/method.session-register.ts`, `sessionRegisterMethod`; `mcp/src/rpc/method.message-log.ts`, `messageLogMethod`; `mcp/src/rpc/method.session-activity-report.ts`, `sessionActivityReportMethod`; `mcp/src/rpc/method.message-deliver.ts`, `messageDeliverMethod`; `mcp/src/rpc/method.subagent-create.ts`, `subagentCreateMethod` (`Date.now`, `randomUUID`); `mcp/src/rpc/method.subagent-start.ts`, `startSubagent` (`Date.now`, `randomUUID`) and `spawn` (`AbortSignal.timeout`); `mcp/src/rpc/method.task-create.ts`, `taskCreateMethod`; `mcp/src/rpc/method.task-run-start.ts`, `taskRunStartMethod` (two calls); `mcp/src/rpc/method.task-run-end.ts`, `taskRunEndMethod`; `mcp/src/rpc/method.task-stop.ts`, `taskStopMethod`
- Problem: Ten method modules call `Date.now()`, two call `randomUUID()` from `node:crypto`, and `spawn` builds a real timeout signal. None of these goes through a seam, so a unit test cannot fix the time or the ids, or shorten `ATTACH_TIMEOUT`.
- Fix: Add `clock` (`now()`, and a timeout signal factory) and `ids` (`sessionId()`) to `MethodContext`, backed by small adapters, and read them in every handler.
- Status: resolved by ticket 11

### mcp-rpc-9. Domain refusals reuse the JSON-RPC protocol error codes

- Kind: design
- Severity: minor
- Location: `mcp/src/rpc/rpc-error.ts`, `RPC_ERROR_CODES`; every method and operation that throws `RpcError`, such as `mcp/src/rpc/task-guards.ts`, `openCompleteTask`, `mcp/src/rpc/claim-tickets.ts`, `claimTickets`, and `mcp/src/rpc/worktree-call.ts`, `worktreeCall`
- Problem: Methods report "task is done", "ticket is held by another session", "not found", git conflicts and other domain refusals as `INVALID_REQUEST` (-32600) or `INVALID_PARAMS` (-32602). JSON-RPC reserves these codes for a malformed request object and for parameters that do not fit the method. A client cannot tell a protocol fault from a domain refusal, or one refusal from another, except by parsing the message text. Only `worktreeCall` adds a `kind` in `data`.
- Fix: Define domain error codes in the server range (for example `NOT_FOUND`, `CONFLICT`, `NOT_ALLOWED`, `HELD_ELSEWHERE`) in one place, and throw them through small factory functions.
- Status: kept: domain error codes would change the codes that the tools, the command line tool and the web app receive, and this task changes no behavior

### mcp-rpc-10. Results of requests to the session server are cast, not checked

- Kind: design
- Severity: minor
- Location: `mcp/src/rpc/method.skill-list.ts`, `skillListMethod.handle`; `mcp/src/rpc/method.subagent-stop.ts`, `killTask`; `mcp/src/rpc/method.subagent-start.ts`, `startSubagent`; `mcp/src/rpc/method.subagent-create.ts`, `subagentCreateMethod.handle`
- Problem: `RpcConnection.request` returns `unknown`, and each caller builds the params as `z.input<typeof X.params>` and casts the result with `as { ... }`. Nothing ties the name, params and result together, and a changed session method only fails at run time.
- Fix: Add one typed helper, `call(connection, method, params)`, that takes a session `Method` object and returns its result type. Optionally give `Method` a result schema and check the result with it.
- Status: resolved by ticket 11

### mcp-rpc-11. The change feed lets a listener exception escape its timer

- Kind: design
- Severity: minor
- Location: `mcp/src/changes/change-feed.timer.ts`, `flush`
- Problem: `flush` calls the listeners in a `setTimeout` callback with no `try`. A listener that throws skips the remaining listeners and resources, and the exception is uncaught, which ends the repository server. Today the only listener is the SSE writer of the web server, so this is a robustness gap, not an observed crash.
- Fix: Call each listener inside `try`/`catch`, and report a failure to the standard error without stopping the other listeners.
- Status: kept: a listener that throws would no longer end the repository server, which is a change of behavior that this task does not make; the comment of `ChangeFeed.subscribe` now states the failure

### mcp-rpc-12. Methods call other methods' `handle` as a domain library, and method files export shared helpers

- Kind: structure
- Severity: major
- Location: `mcp/src/rpc/method.task-get.ts`, `taskGetMethod` (called through `.handle` 22 times in 19 files, such as `open-task.ts`, `open-ticket.ts`, `method.goal-save.ts`, `method.worktree-merge.ts`, `method.task-run-start.ts`); `mcp/src/rpc/method.ticket-request-changes.ts`, `saveReopened` (calls `ticketsSaveMethod.handle`) and `ticketRequestChangesMethod` (calls `ticketSetStatusMethod.handle`); `mcp/src/rpc/method.subagent-start.ts` and `mcp/src/rpc/method.task-orchestrator-deliver.ts` (call `messageDeliverMethod.handle`); exported helpers `deleteSubagent` (`method.session-delete.ts`), `deliverServerMessage` (`method.message-deliver.ts`), `startSubagent` (`method.subagent-start.ts`), `stopSubagent` (`method.subagent-stop.ts`), `TASK_REFERENCE` (`method.task-get.ts`)
- Problem: The domain operations (find a task, save tickets, approve a ticket, deliver a message, start, stop or delete a subagent) live inside RPC method objects or in their files. Other methods call them through `handle`, which skips the zod schema. For example, `ticketRequestChanges` passes whole `Ticket` objects to `ticketsSave` unparsed and with no `trim`. Methods therefore form an import graph among themselves, and no domain service can be tested or reused without the RPC layer. The pattern "check the task exists, change it, then `return taskGetMethod.handle(...)`" repeats in `goalSave`, `goalDelete`, `designSave`, `taskSetStatus`, `ticketsSave`, `taskRunStart` and `taskRunEnd`.
- Fix: Move the domain operations into plain functions or services, such as `findTask(reference, tasks)`, `saveTickets`, `approveTicket`, `deliverServerMessage`, `startSubagent`, `stopSubagent` and `deleteSubagent`, in modules outside the method files. Make each method a thin adapter that parses params and calls one operation. No method file should import another method file.
- Status: resolved by ticket 11

### mcp-rpc-13. The lookup of a registered session is repeated in seven methods

- Kind: structure
- Severity: minor
- Location: `mcp/src/rpc/method.session-task-set.ts`; `mcp/src/rpc/method.session-ticket-set.ts`; `mcp/src/rpc/method.session-alias-set.ts`; `mcp/src/rpc/method.session-delete.ts`; `mcp/src/rpc/method.message-log.ts`; `mcp/src/rpc/method.message-log-delete.ts`; `mcp/src/rpc/method.session-usage-set.ts`
- Problem: Each method repeats `await sessions.get(sessionId)` and throws `INVALID_PARAMS` with "No session ${sessionId} is registered".
- Fix: Add one helper, `registeredSession(sessionId, context)`, that returns the session or throws, and use it in all seven.
- Status: resolved by ticket 11

### mcp-rpc-14. Ticket lookup and status guards are duplicated across methods

- Kind: structure
- Severity: minor
- Location: `mcp/src/rpc/open-ticket.ts`, `openTicket` and `openCompleteTask`; `mcp/src/rpc/method.subagent-create.ts`, `checkTicket`; `mcp/src/rpc/method.ticket-diff.ts`, `ticketDiffMethod.handle`; `mcp/src/rpc/method.worktree-delete.ts`, `deleteTicket`; `mcp/src/rpc/method.ticket-request-changes.ts`, `reviewedTicketOf`; `mcp/src/rpc/method.worktree-merge.ts`, `checkMergeable` and `mergeTicket`; `mcp/src/rpc/method.ticket-set-status.ts`, `PARAMS` and `ticketSetStatusMethod.handle`
- Problem: "Task N has no ticket M" with `tasks.find` is written five times. The "task is done / plan is not complete" guard is written three times (`openCompleteTask`, `checkMergeable`, `reviewedTicketOf`) with the same messages. The "working" status test (`in-progress` or `blocked`) is written three times. `ticketSetStatus` hard-codes its status list (`['not-started', 'in-progress', 'blocked', 'done']`) where `taskSetStatus` derives its list from `TASK_STATUSES` with `.exclude`.
- Fix: Add `ticketOf(task, ticketId)`, `checkComplete(task)` and `isWorking(status)` beside `hasLanded`, and use `z.enum(TICKET_STATUSES).exclude(['needs-review'])`.
- Status: resolved by ticket 11

### mcp-rpc-15. `subagentCreate` and `startSubagent` duplicate the subagent registration flow

- Kind: structure
- Severity: minor
- Location: `mcp/src/rpc/method.subagent-create.ts`, `subagentCreateMethod.handle`; `mcp/src/rpc/method.subagent-start.ts`, `startSubagent`; `mcp/src/rpc/method.session-register.ts`, `sessionRegisterMethod.handle`
- Problem: All three build the same 13-field `RegisteredSession` literal, with seven fields always `null`. The two subagent paths also repeat the parent lookup, the `randomUUID` id, `subagents.start`, the `subagentFollow` request, and the conversion of an error to a reason string. Their error handling has already diverged (see mcp-rpc-4).
- Fix: Add `newSession(fields)`, which fills the defaults, and one `registerSubagent(parent, fields, context)` function, which both methods call. Keep the error handling in one place.
- Status: resolved by ticket 11

### mcp-rpc-16. Queries of attached subagents are repeated, and small helpers are copied

- Kind: structure
- Severity: minor
- Location: `mcp/src/rpc/method.subagent-create.ts`, `checkTicket` and `sessionOf`; `mcp/src/rpc/method.task-orchestrator-deliver.ts`, `attachedOrchestratorOf`; `mcp/src/rpc/method.task-stop.ts`, `subagentsOf`; `mcp/src/rpc/method.task-delete.ts`, `deleteSubagents`; `mcp/src/rpc/method.skill-list.ts`, `orchestratorOf`; `mcp/src/rpc/method.subagent-stop.ts`, `stopSubagent`; error-to-text in `mcp/src/rpc/dispatch.zod.ts`, `errorObject`, `method.subagent-create.ts`, `method.subagent-start.ts`, `method.task-stop.ts`, `stopOne` and `method.ticket-request-changes.ts`; singular/plural wording in `open-ticket.ts`, `claimTickets`, `method.tickets-save.ts`, `checkLocked`, `method.ticket-set-status.ts`, `checkFollowUps`, `method.worktree-merge.ts`, `checkMergeable` and `method.task-stop.ts`
- Problem: Four methods join `subagents.list()` with `sessions.list()` to find the subagents of a task. Two methods find one subagent in `subagents.list()` by id. `error instanceof Error ? error.message : String(error)` appears five times. The `n === 1 ? 'Ticket' : 'Tickets'` wording appears five times.
- Fix: Add `subagentsOfTask(taskId, context)` and `startedSubagent(sessionId)` (or a `Subagents.get`), `errorMessage(error)`, and a `plural(count, one, many)` helper.
- Status: resolved by ticket 11

### mcp-rpc-17. `rpc/` mixes the protocol with domain helpers, and `open-ticket.ts` has four purposes

- Kind: structure
- Severity: minor
- Location: `mcp/src/rpc/open-ticket.ts`; `mcp/src/rpc/open-task.ts`; `mcp/src/rpc/session-name.ts`; `mcp/src/rpc/slug.ts`
- Problem: README "Layout" describes `rpc/` as "JSON-RPC 2.0: messages, connection, dispatch, and the methods", but the folder also holds domain rules. `open-ticket.ts` combines task guards (`openTicket`, `openCompleteTask`), plan queries (`hasLanded`, `pendingDependencies`), ticket claims (`lastingHolder`, `callHolder`, `claimTickets`, `releaseTickets`, `endWork`) and worktree error mapping (`worktreeCall`). The task guards are split between `open-task.ts` and `open-ticket.ts`. `session-name.ts` (chat naming) and `slug.ts` are not RPC code.
- Fix: Split by purpose into modules outside the protocol files, for example `task-guards.ts` (all `open*` guards), `ticket-claims` helpers next to `attachment/ticket-claims.ts`, a plan-queries module, and `session-name.ts` beside the session store. Keep `worktreeCall` with the RPC error mapping.
- Status: resolved by ticket 11

### mcp-rpc-18. The publishing wrappers repeat one body per store method

- Kind: structure
- Severity: minor
- Location: `mcp/src/changes/publish-changes.feed.ts`, `publishingSessions`, `publishingTasks` (`startRun`, `endRun`, `endRuns`), `publishingMessageLog` (`deleteSession`)
- Problem: `setTask`, `moveTask`, `setTicket`, `setAlias` and `setUsage` have five identical bodies (await, publish on `true`, return). The three run methods and `deleteSession` repeat the same shape with a count or a boolean.
- Fix: Add a `publishedIf(write, changes, resource, changed)` helper next to `published`, and write each wrapper as one line.
- Status: resolved by ticket 11

### mcp-rpc-19. `RpcRequest` is exported but never used

- Kind: structure
- Severity: minor
- Location: `mcp/src/rpc/message.ts`, `RpcRequest`
- Problem: No module imports `RpcRequest`. `dispatch.zod.ts` keeps its own `REQUEST` schema, and `rpc-connection.ndjson.ts` builds requests as plain objects. The interface and the schema can drift apart.
- Fix: Derive `RpcRequest` from the `REQUEST` schema and use it in `request` of the NDJSON connection, or delete it.
- Status: resolved by ticket 11

### mcp-rpc-20. Imports are not sorted, and Biome's import organizer is off

- Kind: style
- Severity: minor
- Location: `mcp/src/rpc/method.ts` (method imports in random order); `mcp/src/rpc/dispatch.ts` (adapter import before `zod`); `mcp/src/rpc/method.task-delete.ts` (`method.session-delete.ts` last); `mcp/src/rpc/method.worktree-delete.ts` (`../storage/task-store.ts` last); `mcp/src/rpc/method.ticket-request-changes.ts` (`./method.ts` before `./method.task-get.ts`)
- Problem: Most files sort imports (external, then parent, then sibling, alphabetical), but these do not. `mcp/biome.json` disables both `linter` and `assist`, so nothing enforces the order.
- Fix: Enable Biome `assist.actions.source.organizeImports` (and the linter) with the shared rules, and apply it.
- Status: resolved by ticket 11

### mcp-rpc-21. Names, parameter order and result types are inconsistent across methods and helpers

- Kind: style
- Severity: minor
- Location: `mcp/src/rpc/session-method.skill-list.ts`, `skillListSessionMethod` vs `session-method.subagent-follow.ts`, `subagentFollowMethod` and `session-method.subagent-task-id.ts`, `subagentTaskIdMethod`; `mcp/src/rpc/method.task-get.ts` and `method.task-delete.ts` (param `task`) vs every other task method (param `taskId`); `mcp/src/rpc/method.subagent-stop.ts`, `stopSubagent(context, sessionId)` and `killTask(context, ...)`, `method.subagent-start.ts`, `spawn(context, ...)`, `method.skill-list.ts`, `orchestratorOf(context, ...)` vs `deleteSubagent(sessionId, context)` and the other helpers with `context` last; result types as named interfaces (`RepositoryGetResult`, `TaskStopResult`, `WorktreeCreateResult`), exported aliases (`AwaitCommandResult`, `RequestedChanges`) or inline object types (`subagentStartMethod`, `skillListMethod`); `mcp/src/rpc/method.task-stop.ts`, `TaskStopResult.stopped` is a mutable `string[]` while other results are `readonly`; `mcp/src/rpc/method.session-register.ts`, `handle` is the only non-`async` handler
- Problem: The same kind of thing has several shapes. Only one session-method export carries the `Session` suffix. Two methods name the task reference `task` and the others use `taskId`. Helpers put `context` first in some places and last in others. Result types are declared three ways, and one handler is not `async`.
- Fix: Settle one convention in the style guide (for example: `<name>SessionMethod` for session methods, `context` always last, a named `readonly` result interface per method, every `handle` `async`) and apply it.
- Status: resolved by ticket 11

### mcp-rpc-22. Doc comments of exported helpers omit their failures

- Kind: docs
- Severity: minor
- Location: `mcp/src/rpc/method.subagent-stop.ts`, `stopSubagent`; `mcp/src/rpc/method.session-delete.ts`, `deleteSubagent`; `mcp/src/rpc/session-name.ts`, `sessionNames`; `mcp/src/rpc/method.subagent-start.ts`, `startSubagent`; `mcp/src/rpc/rpc-connection.ts`, `OpenRpcConnectionFunction`; `mcp/src/changes/change-feed.ts`, `ChangeFeed.subscribe`
- Problem: The method objects document their failures well, but these exported helpers do not. `stopSubagent` does not say it rejects when the session server request fails or the orchestrator has no inbox. `deleteSubagent` claims the subagent ends (see mcp-rpc-2). `sessionNames` does not say it rejects with the task store. `startSubagent` only says "fails as `subagentStart` does", which does not cover a failed `subagentFollow`. `OpenRpcConnectionFunction` does not say how invalid JSON and unknown responses are handled. `subscribe` does not say what happens when a listener throws.
- Fix: State the purpose, each parameter, the return value and every rejection in each of these comments, and correct the `deleteSubagent` statement.
- Status: resolved by ticket 11

### mcp-rpc-23. Some doc comments are not wrapped at the line width

- Kind: docs
- Severity: minor
- Location: `mcp/src/rpc/dispatch.ts`, `DispatchFunction` (line 8); `mcp/src/rpc/method.inbox-await-command.ts`, `inboxAwaitCommandMethod` (lines 19-20); `mcp/src/rpc/method.task-set-status.ts`, `taskSetStatusMethod` (line 20); `mcp/src/rpc/method.worktree-create.ts`, `worktreeCreateMethod` (line 44); `mcp/src/rpc/method.task-stop.ts`, `taskStopMethod` (lines 41-43, short broken line); `mcp/src/rpc/method.ticket-set-status.ts`, `ticketSetStatusMethod` (lines 36-38, short broken line); `mcp/src/changes/publish-changes.ts`, `PublishChangesFunction` (lines 50-52); `mcp/src/changes/publish-changes.feed.ts`, `publishingSessions` (line 86)
- Problem: These comments run past the 120-character width or break early in the middle, because they were edited by hand. The formatter does not wrap comments.
- Fix: Reflow each of these comments to 120 characters, and add a comment-width check to the style rules.
- Status: resolved by ticket 11
