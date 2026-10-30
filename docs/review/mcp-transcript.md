# Review of mcp-transcript

Paths: `mcp/src/transcript/` (`find-transcript.ts`, `find-transcript.claude.ts`, `log-transcript.ts`,
`log-transcript.rpc.ts`, `tail-file.ts`, `tail-file.poll.ts`)

The area finds the transcript of a Claude Code session or subagent, follows the file as it grows, and turns its lines
into RPC calls to the repository server: messages, activity status, newest action, token usage, the task and ticket of
a session, and the plan alias. It follows the interface/adapter pattern (`find-transcript.ts` with
`find-transcript.claude.ts`, `log-transcript.ts` with `log-transcript.rpc.ts`, `tail-file.ts` with
`tail-file.poll.ts`), and every exported member has a doc comment. The tail and the log are small and sound: the tail
keeps partial lines and split UTF-8 characters, reads once more after the abort, and closes its file handle on every
path. The main weight sits in `find-transcript.claude.ts` (841 lines), which mixes file discovery, polling, and seven
line parsers over a dozen Zod schemas, and which keeps hidden module-level state. No major bug was found. Three minor
bugs concern how the subagent transcript is matched, how file errors end a log for good, and how `/clear` is followed
when the new transcript does not exist yet. The rest of the findings are about splitting the large adapter, merging
duplicated helpers, injecting the clock and file system, and completing the doc comments on error behavior.

### mcp-transcript-1. The Claude Code adapter is one 841-line file with mixed purposes

- Kind: structure
- Severity: major
- Location: `mcp/src/transcript/find-transcript.claude.ts`, whole file
- Problem: The file holds three separate concerns. The first is the discovery of files: `claudeFindTranscript`, `readSessionId`, `findTranscriptFile`, `expectedTranscriptFile`, `claudeFindSubagentTranscript`, `findSubagentFile` and `readStart`. The second is the polling for the end of a session: `waitForEnd`, `waitForStop` and `isStopped`. The third is seven pure line parsers: messages (`entryParser`, `parseEntry`, `keepAwaitIds`), activity (`parseActivity`, `endsSubagentTurn`), action (`parseAction`, `actionOf`), usage (`parseUsage`), skills (`parseSkillListing`, `descriptionsOf`, `startedSkill`), and task and ticket results (`taskParser`, `ticketParser`, `parseResult`, `taskOf`, `ticketIdOf`). About 25 schema and marker constants for all of these sit together at the top of the file (lines 19 to 350), far from the code that uses them. A reader must scan the whole file to change one parser, and the pure parsers cannot be imported or tested without the file system code.
- Fix: Split the file by purpose. Keep the discovery and the end polling in `find-transcript.claude.ts`. Move the parsers into pure modules, one per facet or one per small group, such as `claude-entry.message.ts`, `claude-entry.activity.ts`, `claude-entry.usage.ts`, `claude-entry.skills.ts` and `claude-entry.tool-result.ts`, each with its own schema and markers. Behavior does not change.
- Status: resolved by ticket 9

### mcp-transcript-2. The Claude Code adapter reads the file system, the clock and the home directory directly

- Kind: design
- Severity: minor
- Location: `mcp/src/transcript/find-transcript.claude.ts`, `claudeFindTranscript` (`homedir()`, line 382); `readFileIfExists` (`readFile`); `findTranscriptFile` (`readdir`, `access`); `findSubagentFile` (`readdir`); `readStart` (`open`); `claudeFindSubagentTranscript` (`Date.now()`, lines 480 and 498); `waitForEnd`, `waitForStop`, `claudeFindSubagentTranscript` (`setTimeout` from `node:timers/promises`)
- Problem: `LogTranscriptFunction` takes its side effect, `tailFile`, as a dependency, but `FindTranscriptFunction` and `FindSubagentTranscriptFunction` take none. The Claude adapter calls `node:fs/promises`, `os.homedir()`, `Date.now()` and timers itself. The adapter's technology is the Claude Code file format, not the file system, so a test of the discovery rules cannot replace the files, the clock or the polling. Examples of such rules are the fallback to `CLAUDE_CODE_SESSION_ID`, the expected project directory, and the 10 s and 300 s search deadlines.
- Fix: Give the find functions a dependencies parameter, like `LogTranscriptDependencies`, with a small file reader (read text, list a directory, read the first bytes, test whether a file exists), a clock (`now`, abortable `sleep`) and the home directory. `session-server.main.ts` passes the Node implementations.
- Status: resolved by ticket 9

### mcp-transcript-3. Module-level `awaitIds` is hidden shared state that grows without bound

- Kind: design
- Severity: minor
- Location: `mcp/src/transcript/find-transcript.claude.ts`, `awaitIds` (line 97), `keepAwaitIds`, `namesAny`, `entryParser`; `taskParser` and `ticketParser` (`calls` maps)
- Problem: `awaitIds` is a module-level `Set` that every transcript of the process writes to: the main session, each new session after `/clear`, and every subagent. Nothing ever removes an id, so the set grows by two ids for each wait for messages during the life of the session server. `namesAny` copies the set to an array and scans all of it for every user message. In the same way, the `calls` maps of `taskParser` and `ticketParser` keep each call whose result never comes, such as after an interrupt. Because the state is module-level, two tests or two session servers in one process share it, and a test cannot start from an empty set.
- Fix: Pass the await-id state in as an explicit object that the session server creates once and gives to each `Transcript`, or a dependency of the find functions. Bound the set, for example by dropping the ids of a wait once the notice that names them has been seen. Use `for...of` over the set in `namesAny` instead of copying it.
- Status: resolved by ticket 9

### mcp-transcript-4. `Transcript` has seven per-line parse methods that each parse the JSON again

- Kind: design
- Severity: minor
- Location: `mcp/src/transcript/find-transcript.ts`, `Transcript` (`parse`, `parseSkills`, `parseActivity`, `parseAction`, `parseUsage`, `parseTask`, `parseTicket`); `mcp/src/transcript/log-transcript.rpc.ts`, `logLines`, `statusChanges`, `lastAction`, `lastUsage`
- Problem: Each facet of a line is a separate method, and each method calls `JSON.parse` and a Zod schema on the same line. `parse` and `parseActivity` do this for every line. The others do it when a text marker matches. On the first read of a transcript of several MB, every line is parsed at least twice, and `logLines` walks the lines three more times, once each for status, action and usage. Adding a facet means editing the interface, both object literals in the adapter (see mcp-transcript-5) and `logLines`. The session server also wraps `parse` to catch the skill listings (`watchSkills` in `session-server.main.ts`), because the interface offers no other hook.
- Fix: Replace the methods with one `parseLine(line): TranscriptEntry` that parses the JSON once and returns every facet that the line holds: message, activity, action, usage, skills, task and ticket. `logLines` and `watchSkills` read the facets they need from that one result.
- Status: resolved by ticket 9

### mcp-transcript-5. The `Transcript` object literal is written twice

- Kind: structure
- Severity: minor
- Location: `mcp/src/transcript/find-transcript.claude.ts`, `claudeFindTranscript` (lines 390 to 403) and `claudeFindSubagentTranscript` (lines 484 to 497)
- Problem: Both functions build the same 13-field object. They differ only in the `sidechain` flag passed to the five parsers, `backgroundTaskId` and `waitForEnd`. A new parser must be added in both places, and the two copies can drift apart.
- Fix: Add a helper `claudeTranscript(sessionId, path, sidechain, backgroundTaskId, waitForEnd): Transcript` and call it from both functions.
- Status: resolved by ticket 9

### mcp-transcript-6. Abortable poll loops and ENOENT guards are duplicated, in two styles

- Kind: structure
- Severity: minor
- Location: `mcp/src/transcript/find-transcript.claude.ts`, `waitForEnd` (line 421), `waitForStop` (line 538), `claudeFindSubagentTranscript` (line 481), `readFileIfExists` (line 367), `findTranscriptFile` (line 435), `findSubagentFile` (line 509), `POLL_INTERVAL` (line 328); `mcp/src/transcript/tail-file.poll.ts`, `pollTailFile` (line 47), `sizeOf` (line 76), `POLL_INTERVAL` (line 9)
- Problem: Four loops repeat `await sleep(POLL_INTERVAL, undefined, { signal }).catch(() => undefined)`, each with its own copy of a comment on why the error is ignored. `waitForEnd` and `waitForStop` are the same loop with a different check. Both files define `POLL_INTERVAL = 500`. The ENOENT guard appears four times: three times as `.catch((error: NodeJS.ErrnoException) => ...)` and once in `sizeOf` as `try`/`catch` with an `as NodeJS.ErrnoException` cast.
- Fix: Add one shared module, for example `mcp/src/transcript/poll.ts`, with `pollUntil(check, interval, signal)`, an abortable sleep that resolves on abort, and `ifExists(promise, fallback)` for the ENOENT guard. Use it from both adapters, with one style of error check.
- Status: resolved by ticket 9

### mcp-transcript-7. Names in the Claude adapter mislead or are inconsistent

- Kind: style
- Severity: minor
- Location: `mcp/src/transcript/find-transcript.claude.ts`, `TASK_TOOL_ENTRY` (line 133), `TASK_RESULT` (line 152), `ticketIdOf` (variable `worktrees`, line 625), `parseResult` (inline `'"tool_result"'`, line 591), `keepAwaitIds` (inline `'"tool_result"'`, line 654), `parseAction` (inline `'"assistant"'`, line 717), `TICKET_TOOL_MARK` (line 126); `mcp/src/transcript/find-transcript.ts`, `Transcript.parse`
- Problem: `TASK_TOOL_ENTRY` and `TASK_RESULT` also parse the results of `worktreeCreate`, which is not a task tool. The local variable `worktrees` in `ticketIdOf` holds a parsed ticket result. Some text markers are named constants (`USAGE_MARK`, `SKILL_LISTING_MARK`, `TASK_TOOL_MARK`), while others are inline literals. `TICKET_TOOL_MARK` repeats the text of the `TICKET_TOOL` regex by hand. `Transcript.parse` returns a message, while its siblings carry the facet in the name (`parseSkills`, `parseActivity`, `parseUsage`).
- Fix: Rename to `TOOL_CALL_ENTRY`, `TEXT_RESULT` and `ticketResult`, and rename `parse` to `parseMessage`, unless mcp-transcript-4 replaces it. Make every marker a named constant, such as `TOOL_RESULT_MARK` and `ASSISTANT_MARK`.
- Status: resolved by ticket 9

### mcp-transcript-8. Doc comments overflow the line width, imports are unsorted, and arrow body style varies

- Kind: style
- Severity: minor
- Location: `mcp/src/transcript/log-transcript.rpc.ts`, doc of `rpcLogTranscript` (line 18, 153 characters) and imports (lines 6 and 7); `mcp/src/transcript/log-transcript.ts`, doc of `LogTranscriptFunction` (lines 17 to 24, line 19 has 121 characters); `mcp/src/transcript/find-transcript.ts`, `Transcript.waitForEnd` doc (line 217, 122 characters); `mcp/src/transcript/find-transcript.claude.ts`, `parseJson`, `readFileIfExists`, `readSessionId`, `entryParser`, `taskParser`
- Problem: Biome's `lineWidth` is 120, and Biome does not reflow comments, so these lines stay over the limit. The wrapping in `log-transcript.ts` lines 17 to 24 is ragged. The imports of `log-transcript.rpc.ts` are not sorted (`method.session-usage-set.ts` comes before `method.session-register.ts`), and the Biome `assist`, with its organize-imports action, is disabled. Some arrow functions use a block with `return` for one expression (`parseJson`, `readFileIfExists`, `entryParser`), while their neighbors use an expression body.
- Fix: Rewrap the comments to 120 columns. Enable organize-imports in the shared Biome config. Pick one arrow body rule in the code style, such as an expression body when the function is a single expression, and apply it.
- Status: resolved by ticket 9

### mcp-transcript-9. The RPC log adapter reads the clock and holds pure rules and session naming policy

- Kind: design
- Severity: minor
- Location: `mcp/src/transcript/log-transcript.rpc.ts`, `rpcLogTranscript` (`Date.now()`, line 39), `statusChanges`, `lastAction`, `lastUsage`, `planAlias`
- Problem: `since` comes from `Date.now()`, so a test cannot place transcript entries before or after the start of the log. The selection of status changes, the last action and the last usage is pure logic that does not depend on RPC, yet it lives in the RPC adapter. `planAlias`, the rule that names a session `plan-<slug>`, is session naming policy. It sits apart from the other naming rules in `mcp/src/rpc/session-name.ts`.
- Fix: Add a clock (`now`) to `LogTranscriptDependencies`. Move `statusChanges`, `lastAction` and `lastUsage` into a pure module of the area. Move `planAlias` next to the session naming rules.
- Status: resolved by ticket 9

### mcp-transcript-10. The `LogTranscriptFunction` contract omits half of what the log reports

- Kind: docs
- Severity: minor
- Location: `mcp/src/transcript/log-transcript.ts`, `LogTranscriptFunction`
- Problem: The contract names only the registration, the messages, the working or idle status and the newest tool call. It leaves out four calls that `rpcLogTranscript` makes. These are `sessionTaskSet` for each `taskCreate` or `taskGet` result, `sessionAliasSet` after `taskCreate`, `sessionTicketSet` for each `worktreeCreate` result, and `sessionUsageSet`. Unlike the status and the action, the usage is reported from lines that came before the start of the log. The contract also does not name the parameter `dependencies`.
- Fix: List every report in the contract with the lines it covers: all lines, or only lines from the start of the log on. Describe `dependencies`.
- Status: resolved by ticket 9

### mcp-transcript-11. The find contracts and the adapter docs do not state errors or return values

- Kind: docs
- Severity: minor
- Location: `mcp/src/transcript/find-transcript.ts`, `FindTranscriptFunction`, `FindSubagentTranscriptFunction`, `Transcript.waitForEnd`; `mcp/src/transcript/find-transcript.claude.ts`, `claudeFindTranscript`, `claudeFindSubagentTranscript`; `mcp/src/transcript/tail-file.poll.ts`, `pollTailFile`; `mcp/src/transcript/log-transcript.rpc.ts`, `rpcLogTranscript`
- Problem: Neither find contract says that the function can reject. Yet `claudeFindTranscript` rejects when the session file or the `projects` directory fails to read with any error other than ENOENT. `claudeFindSubagentTranscript` rejects when `readdir` fails, or when `open` of a candidate fails. `Transcript.waitForEnd` says it rejects "if the agent cannot be asked for its session", which does not say that it rejects on a failed read of the session file or of the metadata file. The four adapter docs describe how they work, but do not state their return value or errors. `FindSubagentTranscriptFunction` says that the prompt names the session id, but the adapter accepts the id anywhere in the first 16 KB (see mcp-transcript-12).
- Fix: State the rejection cases in each contract, and the return value and errors in each adapter doc. Make the subagent contract match the behavior after the fix of mcp-transcript-12.
- Status: resolved by ticket 9

### mcp-transcript-12. The subagent search matches the session id anywhere in the first 16 KB of any subagent transcript

- Kind: bug
- Severity: minor
- Location: `mcp/src/transcript/find-transcript.claude.ts`, `findSubagentFile`, `PROMPT_BYTES`; `mcp/src/transcript/transcript-files.disk.ts`, `diskTranscriptFiles.readStart`
- Problem: `findSubagentFile` takes the first `agent-*.jsonl` whose first 16 KB contains the session id. It does not check the prompt only. `subagentCreate` calls `subagentFollow` before it returns the session id to its caller. The search can therefore run while the one-shot subagent has no transcript yet, and the caller's own transcript gains a `subagentCreate` tool result that holds the id. When the caller is an orchestrator subagent, its transcript sits in the same `subagents/` directory. If that transcript is still under 16 KB at that moment, the search returns the orchestrator's transcript. Then the chat of the one-shot subagent logs the orchestrator's entries, the end of the one-shot follows the orchestrator's `.meta.json`, and `backgroundTaskId` names the orchestrator, so `taskStop` stops the wrong agent. On the current transcripts on disk, the first `subagentCreate` result sits more than 900 KB into the file, so the bug is latent today. A shorter skill text or a smaller prompt can trigger it.
- Fix: Parse the first line of each candidate. Accept the candidate only when that entry is the prompt (`type` `user`, no `isMeta`) and its text holds `Your session id is <session id>.`.
- Status: deferred: minor latent bug, left for a later task

### mcp-transcript-13. A single failed file read ends the log of a session or subagent for good

- Kind: bug
- Severity: minor
- Location: `mcp/src/transcript/find-transcript.claude.ts`, `readSessionId` and `isStopped` (via `pollUntil`), `findSubagentFile`; `mcp/src/transcript/transcript-files.disk.ts`, `diskTranscriptFiles` (`readText`, `readStart`); `mcp/src/transcript/tail-file.poll.ts`, `sizeOf`, `readAppended`; `mcp/src/transcript/log-transcript.rpc.ts`, `rpcLogTranscript`
- Problem: Every read treats only ENOENT as benign. Any other error, such as EPERM, EBUSY or EACCES, which Windows can return for a short time while another process replaces or scans a file, rejects the loop. The rejection rejects `rpcLogTranscript`. After that, `followSessions` in `session-server.main.ts` stops following the main session for the life of the process: later messages are not logged, and the inbox does not follow the next `/clear`. `logSubagent` gives up on the subagent and never calls `subagentEnd`. `readStart` also rejects the whole subagent search when a single candidate disappears between `readdir` and `open`.
- Fix: In the poll loops (`waitForEnd`, `waitForStop`, `pollTailFile`, `findSubagentFile`), treat a failed read as "no change this round", retry on the next poll, and only give up after repeated failures. In `findSubagentFile`, skip a candidate that cannot be opened.
- Status: deferred: minor bug, left for a later task

### mcp-transcript-14. After `/clear`, a new transcript that does not exist yet is found only through `CLAUDE_PROJECT_DIR`

- Kind: bug
- Severity: minor
- Location: `mcp/src/transcript/find-transcript.claude.ts`, `findTranscript`, `expectedTranscriptFile`
- Problem: When the session file names a new session whose `<id>.jsonl` does not exist yet, the only fallback is the project directory derived from `CLAUDE_PROJECT_DIR`. If the session server's environment lacks that variable, `claudeFindTranscript` returns `undefined`. Then `followCurrentSession` returns `false`, and `followSessions` in `session-server.main.ts` ends. The new session is never bound or logged, and its inbox does not move, until the next `activate`. This breaks the Phase 4 and Phase 7 behavior of following `/clear` with no new `activate`, whenever the variable is missing.
- Fix: When the file is not found, derive the directory from the transcript of the previous session of the same process: the same process writes to the same project directory. Fall back to `CLAUDE_PROJECT_DIR` only for the first session. This needs `FindTranscriptFunction` to accept the previous transcript, or the caller to pass the known project directory.
- Status: deferred: minor bug, left for a later task
