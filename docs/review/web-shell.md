# Review of web-shell

Paths: `web/src/app.tsx`, `web/src/main.tsx`, `web/src/index.css`, `web/src/layout/`, `web/src/tasks/`,
`web/src/tickets/`, `web/src/components/`, `web/vite.config.ts`

The frame of the web app and its task views: the entry point, the shell that resolves the URL into the open task, chat
and ticket, the header with the task tabs, the sidebar with the chats, the task panel with its goals, tickets and
actions, the ticket page, the delete dialog, the generated shadcn components with the hint, the theme styles, and the
Vite config with its proxy to the repository server. The components are accessible and well commented. The shell and
the task panel are long and mix logic with layout, the approval of a ticket runs as a chain of calls in the browser
with no way to retry a failed landing, the same task is read several times per change, and the app has no error
boundary.

### web-shell-1. The shell file holds the resolution of the URL

- Kind: structure
- Severity: minor
- Location: `web/src/app.tsx`, `useView` and `useFirstTaskOfOpenChat`
- Problem: Beside `Shell` and `App`, the file holds the two hooks that resolve the route against the sessions and the
  tasks, keep a renamed chat open, replace the URL with its canonical path, and open the first task of a subagent:
  about 90 lines of state logic in the file of the layout.
- Fix: Move both hooks into a module of their own in `web/src/layout/`, which stays in this area, so that `app.tsx`
  only wires the page.
- Status: resolved by ticket 16

### web-shell-2. The task panel mixes the rules of a task with its layout

- Kind: structure
- Severity: minor
- Location: `web/src/tasks/task-panel.tsx`, `STAGES`, `PLAN_WORDS`, `stageOf`, `statusWordsOf`, `runStateOf`,
  `HeaderAction`, `RunTask`, `StopTask`, `DeleteTask`, `GoalList`, `TicketCount`, `TaskDetails` and `TaskPanel`
- Problem: The file of 434 lines holds the rules that map a status to a stage and to words, the run state of a task,
  four action buttons, two lists, and the sliding panel.
- Fix: Move the stage and run rules into a module without React, and the action buttons into a module of their own.
- Status: resolved by ticket 16

### web-shell-3. The goals and the tickets of a task are read by two copies of one hook

- Kind: structure
- Severity: minor
- Location: `web/src/tasks/use-goals.ts`, `useGoals`; `web/src/tasks/use-tickets.ts`, `useTickets`; their callers
  `GoalList` of `web/src/tasks/task-panel.tsx`, `TicketList` of `web/src/tasks/ticket-list.tsx` and `TicketPage` of
  `web/src/tickets/ticket-page.tsx`
- Problem: Both hooks have the same body and differ in the field they keep. While a task and one of its tickets are
  open, each change of the tasks sends three `taskGet` calls for the same task, and each answer holds the whole design
  of the task, which can be over 100 kB.
- Fix: One hook, such as `useTaskDetail(task)`, that reads the task once per change and shares the answer among its
  callers, such as through a cache keyed by the task.
- Status: resolved by ticket 16

### web-shell-4. The approval of a ticket runs as a chain of calls in the browser

- Kind: design
- Severity: minor
- Location: `web/src/tasks/approve-ticket.ts`, `approveTicket` and `isConflict`
- Problem: The page approves a ticket with four calls: `ticketSetStatus`, `taskGet`, `worktreeMerge`, and on a
  conflict `taskOrchestratorDeliver`. This repeats the rule of the skill `/atomic-workflow:approve` in the browser,
  so a change of the landing rule must change both. The steps are not atomic, which leads to `web-shell-5`.
- Fix: Keep the behavior, but run the steps through the typed client of `web-data-1`, and name in the doc comment the
  rule of the skill that they mirror. A server method that approves and lands in one call is left for a later task.
- Status: kept: `web-data-1` was kept with no typed client, so the steps still call `fetchCall` of
  `web/src/api/rpc.fetch.ts`; the doc comment of `approveTicket` now names the sections of
  `plugin/skills/approve/SKILL.md` that the steps mirror, and a server method that approves and lands in one call is
  left for a later task

### web-shell-5. A failed landing cannot be retried from the page

- Kind: bug
- Severity: minor
- Location: `web/src/tasks/approve-ticket.ts`, `approveTicket`; `web/src/tasks/ticket-list.tsx`,
  `approveDisabledReason`
- Problem: Approving the last ticket sets it `done` before `worktreeMerge` lands the task. When the landing fails for
  a cause other than a conflict, such as changes of the main checkout that it would overwrite, the task stays
  `complete` with every ticket `done`, and every `Approve` button is disabled, since each ticket is approved already.
  Phase 19 of `README.md` says that a new approval lands the task once the cause is gone, but only
  `/atomic-workflow:approve <task>` in a session can do it. Reproduce: leave an uncommitted change in the main checkout
  on a file that the task changes, then approve the last ticket in the task panel.
- Fix: While the task is `complete` and every ticket is `done`, offer an action in the task panel that lands the task
  as the end of `approveTicket` does.
- Status: deferred: minor bug, left for a later task per goal 7

### web-shell-6. The layout and the task views call the RPC client directly

- Kind: design
- Severity: minor
- Location: `web/src/layout/chat-entry.tsx`, `DeleteAgent` and `StopAgent`; `web/src/layout/start-agent-button.tsx`,
  `StartAgentButton`; `web/src/tasks/task-actions.tsx`, `DeleteTask`, `RunTask` and `StopTask`;
  `web/src/tasks/use-task-detail.ts`, `readTaskDetail`; `web/src/tasks/approve-ticket.ts`, `approveTicket`
- Problem: Each imports `call` and names its method as a string, such as `sessionDelete`, `subagentStop`,
  `subagentStart`, `taskDelete`, `taskOrchestratorDeliver`, `taskStop` and `taskGet`, so none of them can run without
  a server.
- Fix: Use the typed client of `web-data-1` from its context.
- Status: kept: `web-data-1` was kept, since the conventions have the components of `web/` import the functions of an
  adapter module in place of a React context; each caller now imports `fetchCall` of the adapter
  `web/src/api/rpc.fetch.ts` by its name, which a test can replace, and a typed function per method is left for a later
  task

### web-shell-7. Small helpers are copied in the area

- Kind: structure
- Severity: minor
- Location: `web/src/layout/sidebar.tsx`, `messageOf`; `web/src/tasks/task-panel.tsx`, `messageOf`;
  `web/src/components/delete-dialog.tsx`, `remove`; `web/src/tasks/ticket-list.tsx`, `approve`;
  `web/src/tasks/run-timer.tsx`, `partsOf` and `SECOND`
- Problem: Four modules turn an error into its message on their own, two of them with the same local `messageOf`.
  `run-timer.tsx` splits a span into hours, minutes and seconds again, as `formatDuration` of
  `web/src/conversation/duration-format.ts` does.
- Fix: Use the helper of `web-data-6`, and the parts of a span that `web-console-6` exports.
- Status: kept: every copy of the message of an error now uses `errorMessage` of `web/src/lib/error-message.ts`;
  `partsOf` of `run-timer.tsx` stays until `web-console-6`, which runs in parallel with this cleanup, exports the parts
  of a span

### web-shell-8. The chats are listed again in the sidebar and in each tab

- Kind: structure
- Severity: minor
- Location: `web/src/layout/sidebar.tsx`, `Sidebar`; `web/src/layout/page-header.tsx`, `PageHeader`, `targetOf`
- Problem: `Shell` already holds the chats of the view from `useView`, yet `Sidebar` calls `listChats` again with the
  same arguments, and `targetOf` calls `listChats` once for each task tab on each render, only to learn whether the
  open chat works on that task.
- Fix: Pass the chats of the view to `Sidebar`, and decide whether the open chat belongs to a task from the `taskId`
  of its session.
- Status: resolved by ticket 16

### web-shell-9. A render error blanks the whole app

- Kind: design
- Severity: minor
- Location: `web/src/main.tsx`; `web/src/app.tsx`, `App` and `Shell`
- Problem: No error boundary wraps any part of the app, so an error thrown during render anywhere, such as by
  `web-review-7` or `web-review-8`, unmounts the whole tree and leaves a blank page with no message.
- Fix: Wrap the main column and the task panel each in an error boundary that shows the message and a way to reload.
- Status: kept: an error boundary adds a view and a way to reload, a change of behavior that this cleanup does not
  make; it is left for a later task

### web-shell-10. The light variants of the themes never apply

- Kind: structure
- Severity: minor
- Location: `web/src/index.css`, the blocks `[data-theme="zen"]` and `[data-theme="claude"]`
- Problem: `web/index.html` and `applyTheme` of `web/src/theme/theme.ts` always set the class `dark`, and the blocks
  `[data-theme="zen"].dark` and `[data-theme="claude"].dark` set each of the same 45 variables, so the light blocks
  are dead. The comment above them says that each theme comes in a light and a dark variant. The tokens
  `--chart-2` to `--chart-5`, `--font-serif` and `--sidebar-primary` are set but no class uses them.
- Fix: Drop the light blocks and the unused tokens, or keep them with a comment that says why.
- Status: kept: the comment above the themes now says that only the dark variants apply, and why the light variants
  and the unused tokens stay: each theme stays the export of tweakcn.com as it is

### web-shell-11. A comment of the Vite config no longer holds

- Kind: docs
- Severity: minor
- Location: `web/vite.config.ts`, `build.chunkSizeWarningLimit`
- Problem: The comment says that the app is one chunk on purpose, but `web/src/lib/code-highlight.ts` loads shiki and
  each grammar with a dynamic import, so the build writes 39 files to `plugin/dist/web/assets/`.
- Fix: Say that the main chunk is large on purpose, and that the highlighter and its grammars load as chunks of their
  own.
- Status: resolved by ticket 16

### web-shell-12. The style differs within the area

- Kind: style
- Severity: minor
- Location: `web/src/app.tsx`, `web/src/tasks/`, `web/src/tickets/ticket-page.tsx`, `web/src/components/ui/`,
  `web/vite.config.ts`, as listed
- Problem: The area mixes styles in these points:
  - Imports: `app.tsx` imports some modules by the alias (`@/routing/route.ts`) and others by a relative path
    (`./api/page-data.ts`); `task-panel.tsx` imports its siblings by the alias.
  - Exports: the generated components of `web/src/components/ui/` end with an `export { ... }` list, while every
    other module exports each member with `export const`. `taskTabIdOf` of `web/src/layout/page-header.tsx` declares
    no return type.
  - Props: `SidebarProps`, `PageHeaderProps` and `TaskPanelProps` are exported interfaces, while `TicketList`,
    `TicketPage`, `RunTimer` and the components of `web/src/components/ui/` take inline types.
  - Braces: `ticket-page.tsx`, `ticket-list.tsx`, `stageOf` and `GoalList` of `task-panel.tsx`, and
    `vite.config.ts` write `if (...) return ...;` without braces, the rest of the area with braces.
  - Placement: `STATUS_WORDS` lives in the component module `web/src/tasks/ticket-list.tsx`, and
    `web/src/tickets/ticket-page.tsx` imports it from there.
  - Types: `TaskIdLabel` takes the id as a string, so both callers write `String(task.id)`.
  - Node code: `vite.config.ts` casts an unknown error with `(error as { stderr?: string })` and writes
    `return void response.destroy()`.
- Fix: Apply the conventions that the conventions ticket writes.
- Status: resolved by ticket 16

### web-shell-13. Doc comments state parameters in prose only, and some are malformed

- Kind: docs
- Severity: minor
- Location: every exported member of the area; `web/src/layout/sidebar.tsx`, `Sidebar` and `ChatEntry`;
  `web/src/app.tsx`, `useView` and `useFirstTaskOfOpenChat`; the components of `web/src/components/ui/`
- Problem: The comments name parameters in backticks inside prose, with no `@param`, `@returns` or `@throws`. The
  comment of `Sidebar` breaks a sentence across three short lines, and the comments of `Sidebar`, `ChatEntry`,
  `useView` and `useFirstTaskOfOpenChat` hold a line longer than the 120 characters of the formatter. The comments of
  the generated components, such as `Button`, `Alert` and `SelectTrigger`, say what the element is, but not what its
  props do.
- Fix: Rewrite each comment of an export to the doc convention that the conventions ticket picks, wrap every comment at
  120 characters, and document the props of the generated components.
- Status: resolved by ticket 16
