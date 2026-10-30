import type { ReactNode } from 'react';
import type { Chat } from '@/chats/chat-list.ts';

/**
 * Props of `EmptyState`.
 */
interface EmptyStateProps {
  /**
   * Heading of the empty state.
   */
  readonly title: ReactNode;

  /**
   * Muted line below the heading.
   */
  readonly children: ReactNode;
}

/**
 * Props of `EmptyChat`.
 */
interface EmptyChatProps {
  /**
   * Chat that has no message.
   */
  readonly chat: Chat;
}

/**
 * Props of `EndedNotice`.
 */
interface EndedNoticeProps {
  /**
   * Chat that has no attached session.
   */
  readonly chat: Chat;
}

/**
 * Line that tells how to attach an orchestrator session.
 */
const ATTACH_HINT = 'Run /atomic-workflow in a Claude Code session of this repository.';

/**
 * Empty state of the main column: its heading `title` over the muted line `children`.
 */
const EmptyState = ({ title, children }: EmptyStateProps) => (
  <div className="flex flex-1 flex-col items-center justify-center gap-3 px-2 py-16 text-center">
    <p className="font-medium text-lg">{title}</p>
    <p className="max-w-md text-muted-foreground text-sm leading-6">{children}</p>
  </div>
);

/**
 * Empty state of the chat `chat` while it has no message: what to ask the main session, or who the subagent is.
 */
export const EmptyChat = ({ chat }: EmptyChatProps) =>
  chat.role === 'orchestrator' ? (
    <EmptyState title="What should the main session do?">Your messages and its replies show here.</EmptyState>
  ) : (
    <EmptyState title={<span className="font-mono wrap-anywhere">{chat.label}</span>}>
      Nothing said yet. Your messages and its replies show here.
    </EmptyState>
  );

/**
 * Main column while no chat is open, since no agent has run in the repository: what attaches one.
 */
export const NoChat = () => (
  <div className="flex min-h-0 flex-1 flex-col">
    <EmptyState title="No agent has run in this repository yet.">{ATTACH_HINT}</EmptyState>
  </div>
);

/**
 * Line in place of the composer while the chat `chat` has no attached session: what attaches the main session, or that
 * the subagent has ended.
 */
export const EndedNotice = ({ chat }: EndedNoticeProps) => (
  <p role="status" className="rounded-2xl border border-dashed px-4 py-3 text-center text-muted-foreground text-sm">
    {chat.role === 'orchestrator' ? (
      `No main session is attached. ${ATTACH_HINT}`
    ) : (
      <>
        <span className="font-mono wrap-anywhere">{chat.label}</span> has ended. Its messages stay here to read.
      </>
    )}
  </p>
);
