# Review of mcp-worktree

Paths: `mcp/src/worktree/`

The area owns the git side of the workflow: the task and ticket branches and their worktrees below
`~/.atomic-workflow/worktrees/`, the sync of a task branch with its base branch, the squash and landing of a ticket, the
landing of a task, the removal of worktrees and branches, the copy of the ignored files into a new worktree, the stop of
processes that run from a directory before its removal, and the lookup of the main worktree. Four interface modules
(`copy-ignored.ts`, `main-worktree.ts`, `stop-processes.ts`, `worktrees.ts`) pair with adapters (`.disk.ts`, `.git.ts`,
`.system.ts`), and the interface modules are free of side effects. Doc comments are thorough and match the README phases
18, 19 and 24 closely. The main problems: one removal path can delete the main checkout, `worktrees.git.ts` holds 1227
lines that fuse every workflow rule with the git and file system calls, and small helpers (process runner, path
comparison, error reading, the worktree list parser) are written several times across the adapters.

### mcp-worktree-1. A removal deletes the main checkout when it has a task or ticket branch checked out

- Kind: bug
- Severity: major
- Location: `mcp/src/worktree/delete-worktrees.ts`, `deleteTicketWorktree` (was `deleteTicket`), `taskWorktrees`, `removeWorktrees` (was `remove`), `removeWorktree`, `removeDirectory`
- Problem: `deleteTicket` and `taskWorktrees` select every listed worktree that has a branch of the ticket or task checked out, so the main checkout is selected when the user has such a branch checked out there. `remove` then stops every process whose command line names a path in the main checkout, and `removeWorktree` runs `git worktree remove --force --force <main checkout>`, which git refuses with "is a main working tree". On that refusal `removeWorktree` falls back to `removeDirectory`, which runs `rm` with `recursive` and `force` on the main checkout, including `.git` and the database in `.agents/atomic-workflow/`. To reproduce: call `worktreeCreate {"taskId":1,"ticketId":2}`, run `git worktree remove <ticket worktree>`, run `git switch atomic-workflow/1-<slug>/2-<slug>` in the main checkout, then call `worktreeDelete {"taskId":1,"ticketId":2}` (the fresh ticket branch counts as landed and a clean main checkout passes `checkClean`; `force` skips both checks). The same happens to `worktreeMerge {"taskId":1}`, `worktreeDelete {"taskId":1}` and `taskDelete` when the main checkout has the task branch or a ticket branch checked out.
- Fix: Never select the main checkout (`layout.checkout`) for removal, and never fall back to `rm` for a worktree that lies outside the directory of its task. A task or ticket branch checked out in the main checkout makes the call reject with `not-allowed` and a message that asks the user to check out another branch there, before any process is stopped or anything is removed.
- Status: resolved by ticket 20

### mcp-worktree-2. `worktrees.git.ts` is a 1227-line module with many purposes

- Kind: structure
- Severity: major
- Location: `mcp/src/worktree/worktrees.git.ts`
- Problem: One file holds the naming and layout of branches and worktrees (lines 251-317), the queue (233-249), worktree creation and the copy of ignored files (481-529), the sync of a task branch (389-479), the squash and landing of a ticket (531-812), the landing of a task (814-883), the deletion checks (885-1003), the removal with the stop of processes (1005-1104), the fork point references (1123-1143), the reading of rebase state from `.git` files (740-775), and the git runner (1185-1227). A reader must hold the whole file to follow one call.
- Fix: Split it by purpose: a git runner module, a naming and layout module, and one module each for create and sync, merge of a ticket, merge of a task, and deletion and removal. `gitCreateWorktrees` stays the adapter that wires them to the queue.
- Status: resolved by ticket 10

### mcp-worktree-3. The rules of the workflow are fused with git and file system calls

- Kind: design
- Severity: major
- Location: `mcp/src/worktree/worktrees.git.ts`, `syncTaskBranch`, `resumeSync`, `syncBlocker`, `squashOnto`, `land`, `mergeTask`, `deleteTicket`, `deleteTask`, `checkLanded`, `checkTaskLanded`, `stoppedRebase`, `removeWorktree`, `removeDirectory`
- Problem: Every decision of the workflow (when to sync or skip a sync, which commit is the fork point, when a branch counts as landed, which refusal to give, what to remove) calls `runGit`, `readFile`, `access`, `mkdir` or `rm` directly, and path comparison reads `process.platform`. None of these rules can be tested without a real repository on disk, and the platform rules cannot be tested on another platform.
- Fix: Put the git and file system operations behind a `Git` interface (branch tips, ancestry, worktree list, rebase state, status, update-ref, rebase, commit, worktree add and remove) with a `.git.ts` adapter, and keep the rules in modules that take that interface and the platform as parameters.
- Status: resolved by ticket 10

### mcp-worktree-4. The main worktree is found by two parsers of `git worktree list`, once per call

- Kind: structure
- Severity: minor
- Location: `mcp/src/worktree/main-worktree.git.ts`, `gitMainWorktree`; `mcp/src/worktree/worktrees.git.ts`, `mainCheckout` (line 262), `listWorktrees` (line 1148), `layoutOf` (line 254)
- Problem: `gitMainWorktree` and `mainCheckout` both read the first entry of `git worktree list --porcelain`, with two constants (`WORKTREE_PREFIX`, `WORKTREE_LINE`), two line splits (`\n` with `trimEnd`, `\r?\n`) and the same error message. `layoutOf` runs this lookup at the start of every call, although the repository server finds the main worktree once at start with `MainWorktree`.
- Fix: Keep one parser of the worktree list, and pass the main worktree into `WorktreesDependencies` in place of `directory`, so `layoutOf` needs no git call.
- Status: resolved by ticket 10

### mcp-worktree-5. Small helpers are written again in each adapter

- Kind: structure
- Severity: minor
- Location: `mcp/src/worktree/copy-ignored.disk.ts`, `execFileAsync`, `NAMED_FAILURE_COUNT`, `insideCheckout`, `maxBuffer` literal (line 103); `mcp/src/worktree/main-worktree.git.ts`, `execFileAsync`; `mcp/src/worktree/stop-processes.system.ts`, `execFileAsync`, `OUTPUT_LIMIT`, `comparable`; `mcp/src/worktree/worktrees.git.ts`, `execFileAsync`, `NAMED_FAILURE_COUNT`, `maxBuffer` literal (line 1213), `isBelow`, `samePath`, `normalized`, `repositoryKey`
- Problem: Four files each define `execFileAsync = promisify(execFile)`. The 64 MiB output limit is written three times, once as a constant and twice as a literal. `NAMED_FAILURE_COUNT = 10` is defined in two files that must agree. The rule "is this path inside that directory, without case on Windows" exists four times (`isBelow`, `samePath` with `normalized`, `insideCheckout`, `comparable`), and `repositoryKey` folds the case a fifth time, each slightly different.
- Fix: Move one process runner (with the output limit and `windowsHide`), one path comparison module, and the failure count next to `CopyFailures` into shared modules, and use them from every adapter.
- Status: resolved by ticket 10

### mcp-worktree-6. Pure logic sits inside adapters and reads the platform at module load

- Kind: design
- Severity: minor
- Location: `mcp/src/worktree/stop-processes.system.ts`, `WINDOWS`, `prefixesOf`, `comparable`, `systemStopProcesses` (uses `process.pid`); `mcp/src/worktree/copy-ignored.disk.ts`, `copyLink`, `linkText`, `absoluteTarget`, `listIgnored`
- Problem: The matching of command lines against directories (with the Git Bash form of a Windows path) and the rewriting of link targets are pure rules, but they live in the adapters and read `process.platform` and `process.pid` directly, so they cannot be tested without the real platform. `copy-ignored.disk.ts` also runs `git ls-files`, a second technology inside the disk adapter.
- Fix: Move the matching and the link rewriting into modules that take the platform and the own process id as parameters, and inject the list of ignored files (a git call) into the disk copy.
- Status: resolved by ticket 10

### mcp-worktree-7. A worktree whose directory is gone makes the checks fail with a misleading error

- Kind: bug
- Severity: minor
- Location: `mcp/src/worktree/merge-task.ts`, `mergeTask`; `mcp/src/worktree/delete-worktrees.ts`, `deleteTicketWorktree` (was `deleteTicket`), `deleteTaskWorktrees` (was `deleteTask`); `mcp/src/worktree/worktree-state.ts`, `checkClean`; `mcp/src/worktree/run-git.process.ts`, `processRunGit` (was `runGit`), `isExitError`
- Problem: `mergeTask`, `deleteTask` and `deleteTicket` without `force` call `checkClean` on each worktree that `git worktree list` names, without a `git worktree prune` first. A worktree whose directory the user deleted by hand is still listed, so `runGit` spawns git with a missing `cwd`. The spawn error has a string code, `isExitError` rejects it, and the call fails with `spawn git ENOENT`, which reads as a missing git program. `worktreeMerge` of a task has no `force`, so the task cannot land until the user runs `git worktree prune`.
- Fix: Prune at the start of each call, or skip listed worktrees whose directory does not exist, and make `runGit` report a missing directory by its path.
- Status: deferred: minor bug, left for a later task

### mcp-worktree-8. A merge continues any stopped rebase of the ticket worktree as if it were the squash

- Kind: bug
- Severity: minor
- Location: `mcp/src/worktree/merge-ticket.ts`, `mergeTicket` (was `merge`)
- Problem: When the ticket worktree has a stopped rebase, `merge` continues it with `continueRebase`, sets the fork point to its `onto`, and lands the branch. It never checks that the rebase is its own squash (branch of the ticket, `onto` the task tip), unlike `resumeSync`, which checks that a rebase of the task worktree is a sync. A rebase that an agent started there, such as `git rebase -i`, lands its commits unsquashed and without the `Atomic-Workflow-Task` and `Atomic-Workflow-Ticket` trailers, skips `checkClean`, and records a wrong fork point. `ticketCommit` then finds no commit for the ticket.
- Fix: Continue only a rebase of the ticket branch whose `onto` is a commit of the task branch, and else reject with `not-allowed` and ask to finish or abort it.
- Status: deferred: minor bug, left for a later task

### mcp-worktree-9. A `git am` in progress breaks the detection of a stopped rebase

- Kind: bug
- Severity: minor
- Location: `mcp/src/worktree/rebase.ts`, `stoppedRebase`, `rebaseDirectory`
- Problem: `rebaseDirectory` treats an existing `rebase-apply` directory as a rebase, but `git am` uses the same directory without the files `head-name` and `onto`. `stoppedRebase` then rejects with a raw `ENOENT` from `readFile`, so `create`, `ensureWorktree` and `merge` fail with an unexpected error instead of a `not-allowed` refusal.
- Fix: Treat `rebase-apply` without `head-name` as an operation that is no rebase of the workflow, and reject with `not-allowed` that asks to finish or abort it.
- Status: deferred: minor bug, left for a later task

### mcp-worktree-10. `create` takes the base branch from the main checkout even when the task branch exists

- Kind: bug
- Severity: minor
- Location: `mcp/src/worktree/create-ticket-worktree.ts`, `createTicketWorktree` (was `create`), `checkedOutBranch`; `mcp/src/worktree/worktrees.ts`, `Worktrees.create`
- Problem: With `baseBranch` `null`, `create` calls `checkedOutBranch` before it knows whether the task branch exists. The doc says the call rejects only "if the task branch must be made but the main checkout has no branch checked out", yet it also rejects when the task branch exists and the main checkout is detached. The caller records the base branch only after a call that succeeds, so after a first call that made the task branch and then failed (for example in `ensureWorktree`), a later call takes whatever branch the main checkout has then, syncs the task branch onto it, and returns it as the base branch to record.
- Fix: Resolve the base branch from the main checkout only when the task branch is made, and else take the branch that the task branch was made from, or reject when it is unknown.
- Status: deferred: minor bug, left for a later task

### mcp-worktree-11. A landed ticket branch counts as unlanded after the task branch was rebased

- Kind: bug
- Severity: minor
- Location: `mcp/src/worktree/branches.ts`, `checkLanded`, used by `mcp/src/worktree/merge-task.ts`, `mergeTask`, and `mcp/src/worktree/delete-worktrees.ts`, `deleteTicketWorktree` and `deleteTaskWorktrees`
- Problem: `checkLanded` asks whether the tip of a ticket branch is an ancestor of the task branch. After a ticket landed and kept its branch, a sync in `create` for another ticket rebases the task branch, so the landed commit is no longer an ancestor. `worktreeDelete` of that ticket and `worktreeMerge` of the task then refuse with "hold commits that ... lacks", although all the work landed. The normal skill flow deletes the ticket branch right after the merge, so the case needs a branch that stayed.
- Fix: Count a ticket branch as landed when its tip equals its fork point, which `merge` sets to the tip once the ticket landed, and fall back to ancestry only for a branch without a fork point.
- Status: deferred: minor bug, left for a later task

### mcp-worktree-12. On Windows, processes in a directory with a non-ASCII path are never found

- Kind: bug
- Severity: minor
- Location: `mcp/src/worktree/stop-processes.system.ts`, `listProcesses`
- Problem: Windows PowerShell 5.1 writes redirected output in the OEM code page, while `execFileAsync` decodes it as UTF-8. A command line with a non-ASCII character, such as a home of `C:\Users\José`, is decoded with replacement characters and never matches the prefix from `resolve`. The processes are not stopped, and the removal of a worktree that they hold fails with a warning.
- Fix: Set `[Console]::OutputEncoding = [Text.Encoding]::UTF8` at the start of `LIST_WINDOWS_PROCESSES`.
- Status: deferred: minor bug, left for a later task

### mcp-worktree-13. Errors are read and written in several ways

- Kind: style
- Severity: minor
- Location: `mcp/src/worktree/copy-ignored.disk.ts`, `codeOf`; `mcp/src/worktree/stop-processes.system.ts`, `isRunning`, `reasonOf`; `mcp/src/worktree/worktrees.git.ts`, `isExitError`, `removeDirectory` (line 1100), `checkRebaseEnded` (line 726), `gitOutput` (line 1201), `ticketCommit` (line 602), `mainCheckout` (line 264)
- Problem: The code of a Node.js error is read three ways (`codeOf`, an inline check in `isRunning`, `isExitError`), and the message two ways (`reasonOf`, an inline ternary in `removeDirectory`). Plain `Error` messages use three formats ("Git ... failed in", "Git rebase failed in", "Git ... failed:"), and some show paths with backslashes while every `WorktreeError` shows them with `forwardSlashes`.
- Fix: Use one shared helper for the code and one for the message of an error, one format for a failed git command, and `forwardSlashes` for every path in a message.
- Status: resolved by ticket 10

### mcp-worktree-14. `refs/heads/` is written as a literal although a constant exists

- Kind: style
- Severity: minor
- Location: `mcp/src/worktree/worktrees.git.ts`, `makeTicketBranch` (line 384), `syncTaskBranch` (lines 411-412), `resumeSync` (line 448), `squashOnto` (line 641), `land` (lines 783-784), `forwardBranch` (line 805), `rebaseOnto` (lines 874-875), `checkLanded` (line 960), `taskBranches` (line 977), `branchExists` (line 1110)
- Problem: `BRANCH_REF_PREFIX` holds `refs/heads/`, but only `ticketCommit` and `stoppedRebase` use it, and the other places repeat the literal. `BRANCH_LINE` repeats it too.
- Fix: Add one helper `branchRef(branch)` and use it everywhere.
- Status: resolved by ticket 10

### mcp-worktree-15. Multi-line `if` bodies mix braces and no braces

- Kind: style
- Severity: minor
- Location: `mcp/src/worktree/worktrees.git.ts`, `syncTaskBranch` (lines 409-410), `resumeSync` (lines 457-461), `merge` (lines 547-557), `removeBranch` (lines 1070-1071)
- Problem: Some `if` statements whose body spans several lines have no braces, and `merge` pairs an unbraced multi-line `if` with a braced `else`, while the rest of the file braces every multi-line body. `merge` and `trailersOf` also write a message with raw newlines inside a template literal, while `lastLines` uses `\n`.
- Fix: Brace every body that spans more than one line (Biome `useBlockStatements` or the formatter of the chosen style), and write newlines in messages as `\n`.
- Status: resolved by ticket 10

### mcp-worktree-16. Doc comments miss the errors, and one describes the wrong behavior

- Kind: docs
- Severity: minor
- Location: `mcp/src/worktree/worktrees.git.ts`, `squashOnto` (lines 632-638); `mcp/src/worktree/worktrees.ts`, `Worktrees.ticketCommit`, `CreateWorktreesFunction`; `mcp/src/worktree/copy-ignored.ts`, `CopyIgnoredFunction`; `mcp/src/worktree/stop-processes.ts`, `StopProcessesFunction`
- Problem: The doc of `squashOnto` says a branch whose commits change nothing "stays as it is", but the code has already run `reset --soft` to the fork point, so the branch drops those commits. `Worktrees.ticketCommit` does not say that it rejects with a plain `Error` when `git show` fails. `CopyIgnoredFunction` and `StopProcessesFunction` do not say that they never reject and report every failure in their result. `CreateWorktreesFunction` names no errors.
- Fix: Correct the doc of `squashOnto`, and state the errors, or that there are none, in each of these doc comments.
- Status: resolved by ticket 10
