# Review of web-console

Paths: `web/src/console/`, `web/src/conversation/`, `web/src/chats/`, `web/src/commands/`

The chat view of the web app: the console page with its log, its pending messages and its composer, the hook that
reads the log of a chat and the hook that keeps the log scrolled to its end, the helpers that format and filter
messages, the list of chats built from the sessions, and the slash menu of the skills. The pure helpers, such as
`parseCommand`, `withoutWorkflowQuotes` and `matchSkills`, are small and clear. The weak points are the long console
page, the direct RPC calls, read guards and helpers copied between hooks, and a few gaps where a send and the event
stream meet.

### web-console-1. The console page holds the rows, the pending messages and the sends in one file

- Kind: structure
- Severity: minor
- Location: `web/src/console/console-page.tsx`, `ConsolePage` and its local components and helpers
- Problem: The file of 496 lines holds the row components (`RowFoot`, `UserText`, `UserRow`, `AgentRow`,
  `ConsoleRow`, `PendingRow`, `SessionBreak`), the empty states, the filter of the visible messages, the state of the
  pending messages, and the choice between `messageDeliver` and `subagentStart` for a send. `ConsolePage` alone spans
  about 150 lines.
- Fix: Move the rows and the empty states into a module of their own, and the pending messages with `track`, `send`
  and `startSubagent` into a hook such as `usePendingSends`, so that `ConsolePage` only lays out the page.
- Status: resolved by ticket 14

### web-console-2. The console and the commands call the RPC client directly

- Kind: design
- Severity: minor
- Location: `web/src/console/console-page.tsx`, `startSubagent` and `send`; `web/src/console/use-chat-log.ts`,
  `readOnce`; `web/src/commands/use-skills.ts`, `refresh`
- Problem: Each imports `call` and names its method as a string (`messageDeliver`, `subagentStart`, `messageList`,
  `skillList`), so none of these units can run without a server.
- Fix: Use the typed client of `web-data-1` from its context.
- Status: kept: the conventions have `web/` import adapter modules in place of a React context, as `web-data-1` keeps; the calls now go to `fetchCall` of the adapter `web/src/api/rpc.fetch.ts` behind `CallFunction`, so a test can replace the module, and a typed function per method is new API that a later task can add with its callers

### web-console-3. The read hooks repeat their guards and the message of an error

- Kind: structure
- Severity: minor
- Location: `web/src/console/use-chat-log.ts`, `useChatLog`; `web/src/commands/use-skills.ts`, `useSkills`;
  `web/src/console/console-page.tsx`, `ConsolePage`
- Problem: Each hook keeps its own `mounted` ref, and each read hook its own rule against overlapping or stale reads:
  `running` and `queued` refs in `useChatLog`, a `latest` counter in `useSkills`. The same `messageOf` is declared in
  all three files.
- Fix: Read through the serial reads of `web-data-5`, and use the helper of `web-data-6` for the message of an error.
- Status: resolved by ticket 14

### web-console-4. The colors of a code block repeat the colors of a diff

- Kind: structure
- Severity: minor
- Location: `web/src/conversation/code-block.tsx`, `useBlockColors`
- Problem: `useBlockColors` is the twin of `useFileHighlight` of `web/src/review/highlight.ts`: a module cache read in
  `useState`, an effect with a `current` flag, a `console.error` on failure, and its own `MAX_LINES = 5000`.
- Fix: Use the highlight hook of `web-data-7`.
- Status: resolved by ticket 14

### web-console-5. The clock is read outside a seam

- Kind: design
- Severity: minor
- Location: `web/src/conversation/message-time.tsx`, `MessageTime`; `web/src/conversation/use-now.ts`, `useNow`
- Problem: `MessageTime` calls `new Date()` during render to decide whether a message is from today, so a test cannot
  fix the time, and the label does not change after midnight. `useNow` is the clock of the app, but it calls
  `Date.now()` and `setInterval` with no way to give it another clock.
- Fix: Provide the clock through a context that `useNow` reads, and let `MessageTime` take the time from `useNow`.
- Status: resolved by ticket 14

### web-console-6. Helpers of time and duration sit in the folder of the conversation

- Kind: structure
- Severity: minor
- Location: `web/src/conversation/use-now.ts`, `useNow`; `web/src/conversation/duration-format.ts`, `formatDuration`;
  `web/src/conversation/time-format.ts`
- Problem: `useNow` and `formatDuration` serve the console and `web/src/tasks/run-timer.tsx` of `web-shell`, which so
  depends on the folder of the conversation for a clock, and copies the arithmetic of `formatDuration` in its own
  `partsOf`.
- Fix: Move the time helpers into a folder named for them, such as `web/src/time/`, which stays in this area, and
  export the parts of a span, so that `run-timer.tsx` can use them.
- Status: resolved by ticket 14

### web-console-7. The chat of the main session relies on the order of `sessionList`

- Kind: design
- Severity: minor
- Location: `web/src/chats/chat-list.ts`, `mainChat`
- Problem: `mainChat` takes `orchestrators.findLast((session) => session.attached)` as the session that attached last.
  That holds only because `sessionList` lists the attached sessions in the order they were bound, which neither
  `ListedSession` nor the doc comment of `mainChat` states.
- Fix: State the order that `mainChat` relies on in its doc comment and in `ListedSession`, or pick the session by a
  field, such as a time of binding, if the server adds one later.
- Status: resolved by ticket 14

### web-console-8. A delivered message leaves the log until the next read

- Kind: bug
- Severity: minor
- Location: `web/src/console/use-pending-sends.ts`, `usePendingSends`, `track`
- Problem: `track` removes the pending row as soon as `messageDeliver` resolves. The message enters the log only once
  the `messages` event, which the server sends 50 ms after the change, leads to the next `messageList` read. So the
  message disappears, then shows again. Reproduce: send a message to an attached session over a slow connection.
- Fix: Keep the pending row until the read that starts after the call resolved has ended.
- Status: deferred: minor bug, left for a later task per goal 7

### web-console-9. A pending message is lost when another chat opens

- Kind: bug
- Severity: minor
- Location: `web/src/console/use-pending-sends.ts`, `usePendingSends`, `pending`
- Problem: The pending messages are state of `ConsolePage`, which `web/src/app.tsx` mounts with `key={open.key}`. When
  the user opens another chat while a send runs, the page unmounts, and a failure of that send is never shown, so the
  text that was not delivered is lost. Reproduce: stop the repository server, send a message, and open another chat
  before the call fails.
- Fix: Keep the pending messages by the key of their chat above `ConsolePage`, so that a failed send still shows when
  its chat opens again.
- Status: deferred: minor bug, left for a later task per goal 7

### web-console-10. A skill sent before the skills are known goes to the main session as text

- Kind: bug
- Severity: minor
- Location: `web/src/console/use-pending-sends.ts`, `usePendingSends`, `send`;
  `web/src/commands/use-skills.ts`, `useSkills`
- Problem: `send` matches the text against `skills.skills ?? []`. While `skillList` has not answered, after it failed,
  or while the session lists no skill, a text such as `/plan 3` in the chat of the main session goes to the main
  session with `messageDeliver`, with its short command, and not to a new subagent. The line below the box shows the
  keys and not where the skill runs, but nothing stops the send.
- Fix: In the chat of the main session, hold the send of a text that starts with a slash and a word until the skills
  are known, or say in the line below the box that the skills are not known yet.
- Status: deferred: minor bug, left for a later task per goal 7

### web-console-11. A read of a chat catches up on at most 1000 messages

- Kind: bug
- Severity: minor
- Location: `web/src/console/use-chat-log.ts`, `useChatLog`, the read that it runs through `serialReads`
- Problem: Each later read asks for at most `LATER_LIMIT` (1000) messages after the greatest id it holds, and
  `messageList` returns the oldest of them. When more than 1000 messages arrived meanwhile, such as after a long drop
  of the stream, the newer ones show only after the next `messages` event.
- Fix: Read again while a read returns `LATER_LIMIT` messages.
- Status: deferred: minor bug, left for a later task per goal 7

### web-console-12. The cache of the code block colors never shrinks

- Kind: bug
- Severity: minor
- Location: `web/src/conversation/code-block.tsx`, `blockColors`
- Problem: `blockColors` is a `Map` keyed by the language and the whole code of each block, and keeps the tokens of
  every block that was ever colored for the life of the page. A long session with many code blocks keeps growing in
  memory.
- Fix: Bound the cache, such as to the latest few hundred blocks, or key the colors by an object that the garbage
  collector can free.
- Status: deferred: minor bug, left for a later task per goal 7

### web-console-13. The style differs within the area

- Kind: style
- Severity: minor
- Location: `web/src/console/`, `web/src/conversation/`, `web/src/chats/`, `web/src/commands/`, as listed
- Problem: The area mixes styles in these points:
  - Names of hook files: `web/src/console/follow-scroll.ts` holds `useFollowScroll`, beside `use-chat-log.ts`, which
    holds `useChatLog`.
  - Imports of a sibling module: `console-page.tsx` and `message-time.tsx` use a relative path, `markdown-body.tsx`
    and `chat-dot.tsx` the alias (`@/conversation/code-block.tsx`, `@/chats/chat-list.ts`).
  - Braces: `useBlockColors` of `code-block.tsx` and `withoutWorkflowQuotes` and its helpers of `workflow-quote.ts`
    write `if (...) return ...;` without braces, the rest of the area with braces.
  - Index access: `trailingQuotesStart` of `workflow-quote.ts` reads `lines[index - 1].trimStart()` with no guard,
    while `sessionBreaks` of `console-page.tsx` guards `entries[index - 1]?.sessionId`. The `tsconfig.json` of `web/`
    does not set `noUncheckedIndexedAccess`, so neither is checked.
  - Props: `ConsolePageProps`, `ConsoleComposerProps` and `SkillMenuProps` are exported interfaces, `SessionBarProps`,
    `ThinkingRowProps` and `MessageTimeProps` local ones, and `MarkdownBody` and `ChatDot` take inline types.
  - Exports: `MAIN` and `TASK_ORCHESTRATOR` of `chat-list.ts` are exported, but only `chat-list.ts` uses them.
  - Times: `MessageTime` takes an ISO string, while `SessionBar` and `ThinkingRow` take milliseconds, so
    `console-page.tsx` turns each timestamp into a string in `timeOf` for `MessageTime` to parse back.
  - Failures: `code-block.tsx` logs with `console.error`, while the other modules show a failure or drop it.
- Fix: Apply the conventions that the conventions ticket writes, and pass times as milliseconds throughout.
- Status: resolved by ticket 14

### web-console-14. Doc comments state parameters in prose only, and some lines run past the width

- Kind: docs
- Severity: minor
- Location: every exported member of the area; the long lines in `web/src/console/console-page.tsx`,
  `visibleMessages`, `ConsolePage` and `send`;
  `web/src/console/follow-scroll.ts`, `useFollowScroll`; `web/src/conversation/markdown-body.tsx`, `MarkdownBody`;
  `web/src/commands/use-skill-menu.ts`, `useSkillMenu`; `web/src/commands/skill-menu.tsx`, `SkillOption` and
  `SkillMenu`
- Problem: The comments name parameters in backticks inside prose, with no `@param`, `@returns` or `@throws`. The
  comment of `ConsolePage` is a paragraph of 14 lines. The comments listed above hold a line longer than the 120
  characters of the formatter, since an edit added a sentence without wrapping it.
- Fix: Rewrite each comment of an export to the doc convention that the conventions ticket picks, and wrap every
  comment at 120 characters.
- Status: resolved by ticket 14
