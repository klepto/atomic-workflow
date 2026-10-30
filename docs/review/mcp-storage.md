# Review of mcp-storage

Paths: `mcp/src/storage/`

The area holds the persistent data of the repository server. Three store interfaces (`SessionStore`,
`MessageLogStore` and `TaskStore`) have SQLite adapters that share one `DatabaseSync` connection. `OpenStorage` opens
the database in WAL mode with a busy timeout of 5 s and runs the schema steps of `MIGRATIONS` in one immediate
transaction. `DatabasePath` places the database file under the main worktree. The code is compact and well
commented. Every exported member has a doc comment, the tables are `STRICT` with `CHECK` constraints, multi-statement
writes run in `BEGIN IMMEDIATE` transactions, and the schema steps follow the documented rebuild pattern (foreign keys
off around the transaction, `foreign_key_check` before commit, and the `sqlite_sequence` kept in step 8). Only the
repository server opens the database, and every adapter call is synchronous, so writes in one process never
interleave. I found no major bug. The findings are a masked error in the rollback path, start-up and query costs that
grow with the size of the database, fragile binding of named parameters, a repeated transaction pattern, a long
`sqliteTaskStore`, inconsistent result shapes, and gaps in the doc comments about errors.

### mcp-storage-1. A failed rollback hides the original error, and `create` can roll back after its commit

- Kind: bug
- Severity: minor
- Location: `mcp/src/storage/immediate-transaction.sqlite.ts`, `immediateTransaction`, which runs every transaction of the area: `sqliteTaskStore` methods `create`, `delete`, `deleteGoal` and `setTickets` in `mcp/src/storage/task-store.sqlite.ts`, `sqliteSessionStore` method `delete` in `mcp/src/storage/session-store.sqlite.ts`, and `runMigrations` in `mcp/src/storage/open-storage.sqlite.ts`
- Problem: The `catch` of `immediateTransaction` runs `database.exec('ROLLBACK')` without a guard. SQLite rolls a transaction back by itself after `SQLITE_FULL`, `SQLITE_IOERR`, `SQLITE_BUSY` or `SQLITE_NOMEM`. In that case `ROLLBACK` throws `cannot rollback - no transaction is active`, and that error replaces the decisive one, such as `database or disk is full`. Before ticket 7, `create` also read the stored task inside the `try` after `COMMIT`, so a failed read tried to roll back a committed transaction. Ticket 7 moved that read after the transaction, so the caller of a failed read now gets the error of the read, for a task that was stored.
- Fix: In `immediateTransaction`, run `ROLLBACK` only while `database.isTransaction` is true, and rethrow the original error.
- Status: deferred: minor bug, left for a later task

### mcp-storage-2. Every start takes the write lock, writes the header and checks every foreign key

- Kind: design
- Severity: minor
- Location: `mcp/src/storage/open-storage.sqlite.ts`, `runMigrations`
- Problem: `runMigrations` always runs `BEGIN IMMEDIATE`, `PRAGMA foreign_key_check` over the whole database, and `PRAGMA user_version = N`, which writes page 1 again. It does this when no step is missing too. The start of the repository server slows as `message_log` grows, because the check looks up the session of every message. A foreign key that broke in any other way also blocks every later start. Its message `The steps of the schema leave a foreign key broken` then names the wrong cause.
- Fix: Read `user_version` first and return when it equals `MIGRATIONS.length`. Read it again inside the immediate transaction, and run the foreign key check and the `user_version` write only when a step ran.
- Status: kept: the fix changes what each start checks and locks, so a database with a broken foreign key would start; the cleanup changes no behavior, and a later task can take it with the index of mcp-storage-3

### mcp-storage-3. The queries of the message log scan the whole log instead of its index

- Kind: design
- Severity: minor
- Location: `mcp/src/storage/message-log-store.sqlite.ts`, `sqliteMessageLogStore`, statements `selectLatest`, `selectAfter`, `selectLatestTimes`
- Problem: The filter `(:sessionId IS NULL OR session_id = :sessionId)` keeps SQLite from using the index `message_log_session`. `EXPLAIN QUERY PLAN` shows `SCAN message_log` for the latest messages of one session. For `after` it searches by rowid from `after` and filters each row, so `after = 0` reads the whole log. `latestTimes` reads every row to find `MAX(timestamp)`, and `messageList` and `sessionList` call these queries often. The log only grows, so each call costs more over time and blocks the event loop of the server, since `node:sqlite` is synchronous.
- Fix: Prepare a separate statement for a given `sessionId` with `session_id = :sessionId`, which uses `message_log_session`. Add a schema step with an index on `message_log (session_id, timestamp)` for `latestTimes`, or keep the latest time on the session.
- Status: kept: the index for `latestTimes` needs a new schema step, and the cleanup keeps the schema version; a later task can change the queries and add the index together

### mcp-storage-4. Store methods bind whole caller objects as named parameters

- Kind: design
- Severity: minor
- Location: `mcp/src/storage/session-store.sqlite.ts`, `register` (`insert.run({ ...session })`) and `setUsage` (`{ id, ...usage }`); `mcp/src/storage/message-log-store.sqlite.ts`, `append` (`insert.get({ ...message })`); `mcp/src/storage/task-store.sqlite.ts`, `create` and `addGoal` (`{ taskId, ...goal }`)
- Problem: `node:sqlite` throws `Unknown named parameter '<key>'` for a key that the statement does not name. It also throws `Provided value cannot be bound` for an `undefined` value. TypeScript accepts a wider object, such as a `LoggedMessage` passed to `append` or a session object with one more field. The store then rejects at runtime with an internal error. Today every caller builds the exact shape, so nothing fails yet. Other methods, such as `setTickets` and `setTicketProgress`, destructure their fields, so the two styles are mixed.
- Fix: Destructure the needed fields in each method before binding, as `storeTickets` does. Or call `setAllowUnknownNamedParameters(true)` on the statements that take caller objects.
- Status: resolved by ticket 7

### mcp-storage-5. The transaction pattern is copied six times

- Kind: structure
- Severity: minor
- Location: `mcp/src/storage/task-store.sqlite.ts`, `create`, `delete`, `deleteGoal`, `setTickets`; `mcp/src/storage/session-store.sqlite.ts`, `delete`; `mcp/src/storage/open-storage.sqlite.ts`, `runMigrations`
- Problem: Each place repeats `BEGIN IMMEDIATE`, `try`, `COMMIT`, `catch`, `ROLLBACK` and `throw`. So the flaw of mcp-storage-1 sits in six places, and a fix must change all of them.
- Fix: Add one helper, such as `immediateTransaction(database, work)` in a shared SQLite module of the area, with the guarded rollback. Use it in all six places.
- Status: resolved by ticket 7

### mcp-storage-6. `sqliteTaskStore` is one function of about 165 lines

- Kind: structure
- Severity: minor
- Location: `mcp/src/storage/task-store.sqlite.ts`, `sqliteTaskStore` (lines 15 to 181)
- Problem: One closure prepares 25 statements and defines tasks, goals, tickets, dependencies and runs. It is hard to read, and a reader must scroll to pair a statement with the method that uses it.
- Fix: Split it by entity. For example, keep goal statements and methods, ticket statements with `storeTickets` and `getTickets`, and run statements in separate functions. Then compose them into the `TaskStore`. The interface stays unchanged.
- Status: resolved by ticket 7

### mcp-storage-7. `open-storage.sqlite.ts` mixes the frozen schema steps with the opening of the database

- Kind: structure
- Severity: minor
- Location: `mcp/src/storage/open-storage.sqlite.ts`, `MIGRATIONS` (lines 25 to 194), `sqliteOpenStorage`, `migrate`, `runMigrations`
- Problem: Most of the 263 lines are SQL of the schema steps, which grow with each new step. The logic that opens the database and runs the steps is hidden at the end of the file.
- Fix: Move `MIGRATIONS` into its own module, such as `schema.sqlite.ts`, and keep the opening and the migration runner in `open-storage.sqlite.ts`.
- Status: resolved by ticket 7

### mcp-storage-8. Data types repeat the fields of other types, and column lists repeat each other

- Kind: structure
- Severity: minor
- Location: `mcp/src/storage/task-store.ts`, `TaskSummary` (repeats `id`, `slug`, `status`, `createdAt`, `runStartedAt`, `runEndedAt` of `Task` with copied doc comments); `mcp/src/storage/session-store.ts`, `SessionUsage` (repeats `contextTokens`, `model`, `effort` of `RegisteredSession`); `mcp/src/storage/session-store.sqlite.ts`, `COLUMNS` and the column list of `insert`; `mcp/src/storage/task-store.sqlite.ts`, `selectTask` and `selectTasks`
- Problem: Each new field of a session or a task must be added, with its doc, in two or three places. The doc comments can drift apart.
- Fix: Derive `TaskSummary` with `Pick<Task, ...>` plus its two counts, and `SessionUsage` with `Pick<RegisteredSession, ...>`. In the adapters, build the select and insert column lists from one map of column to field.
- Status: resolved by ticket 7

### mcp-storage-9. `database-path.git.ts` is not a git adapter and hard-wires `MainWorktree`

- Kind: design
- Severity: minor
- Location: `mcp/src/storage/database-path.git.ts`, `gitDatabasePath`; `mcp/src/storage/database-path.ts`, `DatabasePath`
- Problem: `gitDatabasePath` runs no git itself. It joins a constant path onto the result of the default `MainWorktree`, which it imports directly. So the pair `database-path.ts` and `database-path.git.ts` puts a pure function behind a seam. The real side effect, git, is fixed inside it and cannot be replaced. `repository-server.main.ts` also calls `MainWorktree` once itself and once through `DatabasePath`, so git runs twice for the same answer.
- Fix: Replace the pair with a pure function, such as `databasePath(mainWorktree: string): string`, in `database-path.ts`. Let the caller pass the main worktree that it already has.
- Status: resolved by ticket 7

### mcp-storage-10. Write methods report a missing row in three different ways

- Kind: design
- Severity: minor
- Location: `mcp/src/storage/task-store.ts`, `TaskStore.setDesign`, `setStatus`, `setBaseBranch` (resolve with no result and change nothing), `editGoal`, `deleteGoal`, `setTicketProgress`, `startRun`, `endRun` (resolve with `false`), `addGoal`, `setTickets` (reject through the foreign key)
- Problem: A caller cannot tell from the shape of a method what a missing task does. Callers in `mcp/src/rpc/` must check the task before calling the methods that resolve with no result.
- Fix: Use one convention for a missing task or ticket in every write method. For example, return `boolean` when a row can be missing, as most methods already do.
- Status: resolved by ticket 7

### mcp-storage-11. The session store deletes from the message log

- Kind: design
- Severity: minor
- Location: `mcp/src/storage/session-store.sqlite.ts`, `sqliteSessionStore`, statement `removeMessages` and method `delete`; `mcp/src/storage/message-log-store.sqlite.ts`, `removeSession`
- Problem: Both adapters hold the same `DELETE FROM message_log WHERE session_id = ...`. `SessionStore` then writes data that `MessageLogStore` owns. A change to how messages are stored must change both. The wrapper in `mcp/src/changes/publish-changes.feed.ts` must also know that deleting a session changes `messages`.
- Fix: Run a delete that spans stores at the `Storage` level, for example `Storage.deleteSession(id)`, in one transaction that calls both stores. Or document the deletion of messages as part of the `SessionStore` contract only, and keep the SQL in one shared place.
- Status: resolved by ticket 7

### mcp-storage-12. Static SQL uses template literals in one adapter and single quotes in the others

- Kind: style
- Severity: minor
- Location: `mcp/src/storage/task-store.sqlite.ts`, `removeTaskGoals`, `removeTask`, `selectGoals`, `updateGoal`, `removeGoal`, `negateLaterGoals`, `lowerNegatedGoals`, `updateDesign`, `insertDependency`, `removeDependencies`, `removeTickets`, `removeLaterTickets`, `updateStatus`, `updateBaseBranch`, `updateTicketProgress`, `updateRunStart`, `updateRunEnd`, `updateRunEnds`
- Problem: These statements have no interpolation but use backticks. `session-store.sqlite.ts` and `message-log-store.sqlite.ts` use single quotes for the same kind of SQL. Biome's `noUnusedTemplateLiteral` rule flags these backticks.
- Fix: Use single quotes for one-line SQL with no interpolation. Keep backticks only for multi-line SQL or SQL with `${...}`. Write this in the code style.
- Status: resolved by ticket 7

### mcp-storage-13. The stores return results in inconsistent shapes

- Kind: style
- Severity: minor
- Location: `mcp/src/storage/session-store.ts`, `SessionStore.list` (`RegisteredSession[]`); `mcp/src/storage/task-store.ts`, `TaskStore.list` (`TaskSummary[]`); `mcp/src/storage/message-log-store.ts`, `MessageLogStore.list` (`readonly LoggedMessage[]`); `mcp/src/storage/message-log-store.sqlite.ts`, `deleteSession` and `mcp/src/storage/task-store.sqlite.ts`, `endRuns` (`Number(changes)`) against every other method (`changes > 0`); rows of sessions, messages, goals and task summaries are returned as the null-prototype objects of `node:sqlite`, while tasks and tickets are spread into plain objects
- Problem: The same kind of result has three shapes, mutable or readonly arrays, and plain or null-prototype objects. This invites mistakes, such as a test that compares with `toStrictEqual`, or code that calls `hasOwnProperty` on a row.
- Fix: Return `readonly` arrays from every `list`. Convert `changes` the same way everywhere. Map each row to a plain object in one helper per adapter, as `getTickets` does.
- Status: resolved by ticket 7

### mcp-storage-14. Doc comments of store members leave out the cases that reject

- Kind: docs
- Severity: minor
- Location: `mcp/src/storage/session-store.ts`, `SessionStore.register` (rejects for a `parentId` that is not registered, through the foreign key), `setAlias` (rejects for an alias outside 1 to 60 characters, through the `CHECK`), `setUsage` (rejects for a negative `contextTokens`); `mcp/src/storage/task-store.ts`, `TaskStore.setTickets` (also rejects for a duplicate in `dependsOn`, a dependency or `fixes` that is not less than its own id; it does not reject for a missing task when `tickets` is empty, which its doc says it does), `setTicketProgress` (rejects for a `stage` or `status` outside the checks); `mcp/src/storage/database-path.git.ts`, `gitDatabasePath` (no error stated); `mcp/src/storage/open-storage.ts`, `Storage.close` (throws when called twice)
- Problem: Goal 5 asks every exported member to state its errors. These members reject in cases that their doc comments do not name, and the doc of `setTickets` is wrong for an empty list.
- Fix: Add the reject cases to each doc comment. For `setTickets`, either check that the task exists or narrow the doc to a non-empty list.
- Status: resolved by ticket 7

### mcp-storage-15. Schema steps 1 to 8 have no comment, and `sqliteOpenStorage` does not say it rewrites `.gitignore`

- Kind: docs
- Severity: minor
- Location: `mcp/src/storage/open-storage.sqlite.ts`, `MIGRATIONS` steps 1 to 8 (lines 26 to 144); `sqliteOpenStorage`
- Problem: Steps 9 to 16 each have a comment that says what the step does, but steps 1 to 8 have none. Their purpose, such as the kept `sqlite_sequence` in step 8, is written only in the README. `sqliteOpenStorage` overwrites `.gitignore` on every open, which discards any edit by the user, but neither doc comment says so.
- Fix: Add a one-line comment to each of steps 1 to 8, in the style of the later steps. State in the doc comment of `sqliteOpenStorage` that it rewrites the `.gitignore` on each open, or write the file only when it is missing.
- Status: resolved by ticket 7
