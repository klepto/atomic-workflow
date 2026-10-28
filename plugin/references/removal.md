# Removal

`worktreeDelete`, `taskDelete` and `worktreeMerge` without a ticket remove worktrees, directories and branches. Before
the removal, the server stops each process that runs from a worktree or a directory that it removes, such as a dev
server that an agent left running, and names each one in `stoppedProcesses`. Name each of them to the user.

The removal itself never fails the call. Each worktree, directory or branch that it could not remove, and each process
that it could not stop, adds a line to `warnings`. Such a line means that a program still holds the files, such as a
shell, an editor, or a process that runs as another user. The work is safe all the same: it landed, or was deleted, as
the result of the call says.

When a line of `warnings` says that something could not be removed, deleted or stopped, you are blocked:

1. Do not call the tool again, do not delete or kill anything yourself, and do not wait for the files to free up.
2. Tell the user, with each such line of `warnings`:
   `Blocked: <path or process> could not be removed: <cause that the line names>. Close the program that holds it,
   then delete <path> yourself.`
3. Stop, as the skill says for a block at that step.
