# Review of web-review

Paths: `web/src/review/`

The review of a ticket in the web app: the parser of the patch of `ticketDiff`, the draft of the comments with its
storage in the browser and its export as Markdown, the colors of the code of a diff, the diff view in a unified and a
split layout with its comment threads, and the review page with its file list and its actions. The parser and the
Markdown export are careful and well documented. The two view files are long and mix many parts, the draft module
mixes four purposes, the local storage is called directly, and the stored draft and layout are read without the
guards that their writes have.

### web-review-1. The diff view is one long file of many components

- Kind: structure
- Severity: minor
- Location: `web/src/review/diff-view.tsx`, `CommentComposer`, `CommentCard`, `threadOf`, `LineButton`, `UnifiedBody`,
  `splitRowsOf`, `SplitHalf`, `SplitBody`, `DiffBody`, `useStableCallback` and `FileDiffView`
- Problem: The file of 724 lines holds the comment field and card, the threads, the rails and tints of a line, the
  unified and the split body with the pairing of the split rows, the header of a file, and a generic hook,
  `useStableCallback`.
- Fix: Split it along those parts, such as into the comment thread, the line rendering with both layouts, and the file
  view, and move `useStableCallback` into a hook module of its own.
- Status: resolved by ticket 15

### web-review-2. The review page mixes data hooks, the selection and the actions

- Kind: structure
- Severity: minor
- Location: `web/src/review/review-page.tsx`, `useChanges`, `useDiffLayout`, `LayoutToggle`, `FileList`,
  `OverallComment`, `ChangesNotice` and `ReviewPage`
- Problem: The file of 564 lines holds the read of the changes, the stored layout, five components, and `ReviewPage`,
  whose `reviewOf` builds nine handlers of the selection and the comments inline on every render, and whose bar of
  actions is a nested ternary of four states.
- Fix: Move the two hooks into modules of their own, the selection and its handlers into a hook such as
  `useCommentSelection`, and the bar of actions into a component.
- Status: resolved by ticket 15

### web-review-3. The draft module mixes storage, state, line math and Markdown

- Kind: structure
- Severity: minor
- Location: `web/src/review/review-draft.ts`, `readDraft`, `writeDraft`, `useReviewDraft`, `numberOn`, `sideOf`,
  `covers`, `anchorWords` and `reviewMarkdown`
- Problem: One module stores the draft, holds it as React state, does the math of the sides and numbers of a diff
  line, and writes the review as Markdown. `useReviewDraft` writes the local storage inside the updater of `setState`,
  a side effect that React may run twice, as it does in `StrictMode`.
- Fix: Split it into the storage of the draft, the hook, the line math beside `web/src/review/patch.ts`, and the
  Markdown export. Write the storage outside the updater.
- Status: resolved by ticket 15

### web-review-4. The review calls the local storage and the random source directly

- Kind: design
- Severity: minor
- Location: `web/src/review/review-page.tsx`, `useDiffLayout`; `web/src/review/review-draft.ts`, `readDraft`,
  `writeDraft` and `newCommentId`
- Problem: Both modules call `window.localStorage` themselves, each with its own guard and key format, and
  `newCommentId` calls `crypto.randomUUID`, so neither the draft nor the layout can be tested without a browser.
- Fix: Read and write through the storage seam of `web-data-10`, and take the generator of comment ids as a parameter
  of the hook, with `crypto.randomUUID` as its default.
- Status: resolved by ticket 15

### web-review-5. The review page calls the RPC client directly

- Kind: design
- Severity: minor
- Location: `web/src/review/review-page.tsx`, `useChanges` and `requestChanges`
- Problem: Both import `call` and name `ticketDiff` and `ticketRequestChanges` as strings, so the page cannot run
  without a server.
- Fix: Use the typed client of `web-data-1` from its context.
- Status: kept: as for `web-data-1`, the conventions have `web/` import adapter modules in place of a React context, and the typed client does not exist; `useChanges` and `useReviewActions` call `fetchCall` of the adapter `web/src/api/rpc.fetch.ts`, which a test can replace as a module

### web-review-6. The words and signs of a change are written in several places

- Kind: structure
- Severity: minor
- Location: `web/src/review/diff-view.tsx`, `FILE_STATUSES`, `Code` and `noticeOf`; `web/src/review/review-draft.ts`,
  `fileWords` and `excerptOf`; `web/src/review/highlight.ts`, `useFileHighlight`; `web/src/review/review-page.tsx`,
  `useChanges` and `runAction`
- Problem: The sign of a line (`+`, `-` or a space) is computed in both `Code` and `excerptOf`. The words of a status
  are in `FILE_STATUSES` and again in a local object of `fileWords`. `useFileHighlight` is the twin of `useBlockColors`
  of `web/src/conversation/code-block.tsx`. `review-page.tsx` turns an error into its message inline twice.
- Fix: One `signOf(line)` beside `DiffLine` in `patch.ts`, one table of status words that both `FILE_STATUSES` and
  `fileWords` read, the highlight hook of `web-data-7`, and the helper of `web-data-6`.
- Status: resolved by ticket 15

### web-review-7. The stored layout of the diff is read without a guard

- Kind: bug
- Severity: minor
- Location: `web/src/review/use-diff-layout.ts`, `useDiffLayout`
- Problem: The initial state calls `window.localStorage.getItem` with no `try`, while the write beside it has one. A
  browser that refuses the local storage throws a `SecurityError` there during render, and since the app has no error
  boundary, opening a review leaves a blank page. Reproduce: block the site data of the host of the web server in the
  browser, then open `/task/<task>/<ticket>/review`.
- Fix: Read the layout inside a `try`, as `readStoredTheme` of `web/src/theme/theme.ts` does, and fall back to
  `unified`.
- Status: deferred: minor bug, left for a later task per goal 7

### web-review-8. A stored draft is trusted without a check of its comments

- Kind: bug
- Severity: minor
- Location: `web/src/review/draft-store.ts`, `readDraft`
- Problem: `readDraft` checks only that `comments` is an array. A comment without `anchor`, `path` or `body`, such as
  one stored by an older shape of the draft or edited by hand, reaches `markOf` of `web/src/review/line-mark.ts` and
  `anchorWords` of `web/src/review/comment-anchor.ts`, which throw during render and blank the page.
- Fix: Check the shape of each stored comment, and drop the ones that do not match.
- Status: deferred: minor bug, left for a later task per goal 7

### web-review-9. A draft stays in the storage when its ticket is approved elsewhere

- Kind: bug
- Severity: minor
- Location: `web/src/review/draft-store.ts`, `writeDraft`; `web/src/review/use-review-draft.ts`, `useReviewDraft`
- Problem: A draft leaves the local storage only when the review page empties it, such as by its own `Approve`. When
  the ticket is approved by the `Approve` button of the task panel or by `/atomic-workflow:approve`, or when its task
  is deleted, the entry `atomic-workflow:review:<task>:<ticket>` stays for good, and the review of the done ticket
  shows the old comments again.
- Fix: Drop the draft of a ticket that is `done` when the review reads it, and drop the drafts of a task when it is
  deleted from the page.
- Status: deferred: minor bug, left for a later task per goal 7

### web-review-10. The changes of a ticket are not read again after the task branch moved

- Kind: bug
- Severity: minor
- Location: `web/src/review/use-changes.ts`, `useChanges`; `web/src/review/use-review-actions.ts`, `requestChanges` of
  `useReviewActions`
- Problem: `useChanges` reads `ticketDiff` only when the task, the ticket or `landed` changes. When the task branch is
  rebased onto its base branch while the review is open, such as by `worktreeCreate` for the next ticket, the commit of
  the ticket gets a new id, but the page keeps the old one, and `Request changes` names the old commit in the new
  ticket.
- Fix: Read the changes again on each change of the tasks, such as when the `tasks` event changes the ticket that the
  page receives.
- Status: deferred: minor bug, left for a later task per goal 7

### web-review-11. The style differs from the other areas and within the area

- Kind: style
- Severity: minor
- Location: `web/src/review/`, as listed
- Problem: The area mixes styles in these points:
  - Imports of a sibling module always use the alias, such as `@/review/patch.ts` in `review-draft.ts`, while the
    other areas mix the alias and a relative path for siblings.
  - Braces: `review-page.tsx`, `review-draft.ts`, `patch.ts`, `highlight.ts` and `diff-view.tsx` write
    `if (...) return ...;` without braces, and `ChangesNotice` of `review-page.tsx` returns multi-line JSX from an
    `if` without braces.
  - Casts: `patch.ts` writes `lines[index] as string` and the like seven times, which changes nothing, since the `tsconfig.json`
    of `web/` does not set `noUncheckedIndexedAccess`.
  - Props: `ReviewPage`, `FileDiffView`, `FilePath`, `LineCounts` and `CommentComposer` take inline prop types, where
    other areas export a props interface.
  - Exports: `CommentComposer` of `diff-view.tsx` is exported, but only `diff-view.tsx` uses it.
  - Failures: `highlight.ts` logs with `console.error`.
- Fix: Apply the conventions that the conventions ticket writes.
- Status: resolved by ticket 15

### web-review-12. Doc comments state parameters and errors in prose only

- Kind: docs
- Severity: minor
- Location: every exported member of the area, such as `parsePatch` of `web/src/review/patch.ts`, `useReviewDraft` of
  `web/src/review/review-draft.ts` and `ReviewPage` of `web/src/review/review-page.tsx`
- Problem: The comments name parameters in backticks inside prose, with no `@param`, `@returns` or `@throws`, and the
  components with inline props document them only in the comment of the component. `useFileHighlight` does not say
  that it logs a failure to the console.
- Fix: Rewrite each comment of an export to the doc convention that the conventions ticket picks, with each parameter,
  the return value and each error.
- Status: resolved by ticket 15
