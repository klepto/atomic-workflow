# Review of web-data

Paths: `web/src/api/`, `web/src/routing/`, `web/src/lib/`, `web/src/theme/`

The data layer of the web app and its shared helpers: the JSON-RPC client over `/rpc`, the event stream of `/events`
with the connection state, the hook that keeps the page data current, the wire types of the server, the URL routing
with its links, the class helper and the code highlighter, and the theme store with its picker. The modules are small
and every export has a doc comment. The main gaps are the missing seams: the RPC client and the local storage are
called directly, so no unit above them can be tested without a server or a browser. The wire types are copied by hand
from `mcp/`, and the routing module depends on the chats of `web-console`. Several helpers that other areas copy, such
as serial reads, the message of an error and the highlight hook, have no shared home here yet.

### web-data-1. Every caller reaches the RPC client through a direct import

- Kind: design
- Severity: major
- Location: `web/src/api/rpc.fetch.ts`, `fetchCall`, behind `CallFunction` of `web/src/api/rpc.ts`; used by
  `web/src/api/use-page-data.ts`, `usePageData`, and by nine modules of `web-console`, `web-review` and `web-shell`
- Problem: `call` is a module function over `fetch` that takes the method name as a string and returns whatever the
  caller casts it to. No module can be given another client, so no hook or component that reads or writes data can
  be tested without a running server, and a typo in a method name or a wrong result type still compiles.
- Fix: Declare an `RpcClient` interface in `web/src/api/` with one typed function per method that the app calls, such
  as `sessionList`, `taskGet` and `messageDeliver`. Implement it over `call`, and provide it through a React context
  that the hooks read. The cleanups of the other areas move their calls to it.
- Status: kept: the conventions have `web/` import adapter modules in place of a React context, and `call` now sits behind `CallFunction` of `web/src/api/rpc.ts` in the adapter `fetchCall` of `web/src/api/rpc.fetch.ts`, so a test can replace the module; a typed function per method is new API that a later task can add with its callers

### web-data-2. The wire types are copied by hand from `mcp/`

- Kind: design
- Severity: minor
- Location: `web/src/api/types.ts`, every interface, such as `ListedSession`, `TaskSummary` and `Ticket`
- Problem: Each type restates a type of `mcp/src/` by hand, and names its source only in a comment. A change on the
  server still compiles in `web/` and breaks at run time. The copies also drift: `TaskSummary.status` is a plain
  `string`, while `Ticket.status` is a union, so `web/src/tasks/task-panel.tsx` keys its words by
  `Record<string, string>`.
- Fix: Import the types type-only from `mcp/src/` through a path alias, or move them into one module that both
  packages import. At the least, type `TaskSummary.status` as the union of `TaskStatus`.
- Status: kept: an import of the types of `mcp/src/` would pull the Node.js types of `mcp/` into the type check of `web/`, and a shared module is a change of both packages beyond this cleanup; `TaskSummary.status` now has the union `TaskStatus`

### web-data-3. The routing module depends on the chats of the console

- Kind: design
- Severity: minor
- Location: `web/src/routing/route.ts`, `chatRefOf` and `findChat`, and the import of `Chat` from
  `web/src/chats/chat-list.ts`
- Problem: `web-data` is the lower layer, and its cleanup runs first, yet `route.ts` imports `Chat` from
  `web/src/chats/`, a path of `web-console`. `chatRefOf` only returns `chat.ref`.
- Fix: Move `findChat` beside `listChats` in `web/src/chats/chat-list.ts`, or make it generic over
  `{ ref: string; name: string; key: string }`, so that `route.ts` imports nothing from `web/src/chats/`. Replace
  `chatRefOf(chat)` with `chat.ref` at its callers.
- Status: resolved by ticket 13

### web-data-4. `findTask` and `findTicket` repeat one lookup

- Kind: structure
- Severity: minor
- Location: `web/src/routing/route.ts`, `findTask`, `findTicket`, `taskRefOf` and `ticketRefOf`
- Problem: Both lookups try the canonical ref `<id>-<slug>`, then the id, then the slug, with the same three `find`
  calls, and both ref functions format `<id>-<slug>` the same way.
- Fix: One generic `findByRef` and one `refOf` over `{ id: number; slug: string }`, with the four exports kept as thin
  names or replaced at their callers.
- Status: resolved by ticket 13

### web-data-5. Serial reads are private to the page data

- Kind: structure
- Severity: minor
- Location: `web/src/api/page-data.ts`, `serialReads`
- Problem: `serialReads` keeps reads of one resource from overlapping, but it is not exported. So
  `web/src/console/use-chat-log.ts` writes the same rule again with `running` and `queued` refs, and
  `web/src/commands/use-skills.ts` drops stale answers with a counter of its own.
- Fix: Export `serialReads` from a module of its own in `web/src/api/`, so that the cleanup of `web-console` can reuse
  it.
- Status: resolved by ticket 13

### web-data-6. No shared helper gives the message of an error

- Kind: structure
- Severity: minor
- Location: `web/src/lib/utils.ts`
- Problem: Eight modules of the other areas turn an unknown error into its message with the same expression
  `error instanceof Error ? error.message : String(error)`, five of them as a local `messageOf`.
- Fix: Add one exported `errorMessage(error: unknown): string` to `web/src/lib/`, which the cleanups of the other areas
  use.
- Status: resolved by ticket 13

### web-data-7. The code highlighter offers no hook, so two areas copy one

- Kind: structure
- Severity: minor
- Location: `web/src/lib/code-highlight.ts`, `highlighterOf`
- Problem: `useBlockColors` of `web/src/conversation/code-block.tsx` and `useFileHighlight` of
  `web/src/review/highlight.ts` each keep a module cache, read it in `useState`, color in an effect with a `current`
  flag, log a failure with `console.error`, and declare `MAX_LINES = 5000`.
- Fix: Add one hook beside `highlighterOf` that takes a cache key and a function that colors, and returns the colors or
  `undefined` while they load. The cleanups of `web-console` and `web-review` move to it.
- Status: resolved by ticket 13

### web-data-8. A failed read of the page data shows nothing

- Kind: design
- Severity: minor
- Location: `web/src/api/use-page-data.ts`, `keepLastData` and `usePageData`
- Problem: A failed `repositoryGet`, `sessionList` or `taskList` is dropped on purpose. When the first read fails while
  the stream stays up, the main column stays empty, with no message, until the next event of that resource or a
  reconnect. `PageData` has no field that could carry the failure.
- Fix: Keep the failure of each resource in `PageData`, so that the shell can show it, and retry a failed first read.
- Status: kept: a failure that the shell shows and a read that retries change the behavior of the page, which this cleanup keeps; a later task can add both

### web-data-9. The event stream module also holds the connection state

- Kind: structure
- Severity: minor
- Location: `web/src/api/event-stream.ts`, `online`, `setOnline`, `useConnection` and `openStream`
- Problem: The module mixes two purposes: it opens a stream, and it is the store of the connection state. The state
  is one module variable for every stream, so a second `useEventStream` would overwrite it, and the cleanup of any
  stream sets it back to online. `useConnection` has no return type.
- Fix: Let `openStream` report its state through a callback, and keep the connection state in a store of its own that
  the one stream of the page feeds.
- Status: resolved by ticket 13

### web-data-10. The theme module calls the local storage and the DOM directly

- Kind: design
- Severity: minor
- Location: `web/src/theme/theme.ts`, `readStoredTheme`, `setTheme` and `applyTheme`
- Problem: The theme store calls `window.localStorage` and writes `document.documentElement` itself, so it cannot be
  tested without a browser. `web/src/review/review-page.tsx` and `web/src/review/review-draft.ts` wrap the local
  storage again on their own, one of them without a guard, and the keys use two formats: `atomic-workflow.theme` here,
  `atomic-workflow:diff-layout` and `atomic-workflow:review:<task>:<ticket>` there.
- Fix: Add one storage seam in `web/src/lib/`, such as `localStore` with `read(key)` and `write(key, value)` that
  absorb a refused storage, and one key format. The theme reads and writes through it. The cleanup of `web-review`
  moves its two users to it.
- Status: resolved by ticket 13

### web-data-11. A change right after the page loads can be missed

- Kind: bug
- Severity: minor
- Location: `web/src/api/use-page-data.ts`, `usePageData`; `web/src/api/event-stream.event-source.ts`,
  `eventSourceOpenStream`, `handleOpen`
- Problem: At load the page starts its reads, then opens `/events`. A change that the server makes after it answered a
  read and before the stream connected sends an event that the page never receives, and the first `open` reads
  nothing again, since `dropped` is false. The page shows the stale data until the next event of that resource.
- Fix: Read everything on every `open` of the stream, the first one included, or start the reads once the stream is
  open.
- Status: deferred: minor bug, left for a later task per goal 7

### web-data-12. A failed load of the highlighter stays failed

- Kind: bug
- Severity: minor
- Location: `web/src/lib/code-highlight.ts`, `highlighterOf`
- Problem: `highlighter ??= createPageHighlighter()` keeps the promise even when it rejects, such as when a chunk of
  shiki fails to load. From then on no code block and no diff gets colors until the page reloads.
- Fix: Clear `highlighter` when its promise rejects, so that the next code to color tries again.
- Status: deferred: minor bug, left for a later task per goal 7

### web-data-13. The style differs within the area

- Kind: style
- Severity: minor
- Location: `web/src/api/page-data.ts`, `web/src/theme/theme-picker.tsx`, `web/src/routing/navigation.ts`,
  `web/src/api/event-stream.ts`, `web/src/theme/theme.ts`, `web/src/lib/utils.ts`
- Problem: The area mixes styles in these points:
  - Imports of a sibling module: `page-data.ts` and `theme-picker.tsx` use a relative path (`./rpc.ts`,
    `./theme.ts`), `navigation.ts` the alias (`@/routing/route.ts`).
  - Return types: `useConnection`, `useTheme`, `setTheme`, `applyStoredTheme` and `cn` declare none, while the other
    exports do.
  - Exports: `DEFAULT_THEME`, `THEME_STORAGE_KEY` and `getTheme` of `theme.ts` are exported, but only `theme.ts` uses
    them.
  - Storage keys: `atomic-workflow.theme` separates with a dot, the keys of `web-review` with a colon.
- Fix: Apply the conventions that the conventions ticket writes: one import style for sibling modules, a return type
  on each export, and an export only for what another module uses.
- Status: resolved by ticket 13

### web-data-14. Doc comments state parameters, results and errors in prose only

- Kind: docs
- Severity: minor
- Location: every exported member of the area, such as `call` of `web/src/api/rpc.ts`, `parseRoute` of
  `web/src/routing/route.ts` and `highlighterOf` of `web/src/lib/code-highlight.ts`
- Problem: The comments name parameters in backticks inside prose, with no `@param`, `@returns` or `@throws`. Some
  leave out an error: `highlighterOf` does not say that it rejects when the highlighter or a grammar fails to load,
  and `navigate` does not describe its `options`.
- Fix: Rewrite each comment of an export to the doc convention that the conventions ticket picks, with each parameter,
  the return value and each error.
- Status: resolved by ticket 13
