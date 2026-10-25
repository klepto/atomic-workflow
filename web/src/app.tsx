import { useState } from 'react';
import type { ListedSession } from '@/api/types.ts';
import { type Chat, defaultChat, listChats } from '@/chats/chat-list.ts';
import { Alert, AlertDescription } from '@/components/ui/alert.tsx';
import { ScrollArea } from '@/components/ui/scroll-area.tsx';
import { ConsolePage, NoChat } from '@/console/console-page.tsx';
import { useConnection } from './api/event-stream.ts';
import { usePageData } from './api/page-data.ts';
import { PageHeader } from './layout/page-header.tsx';
import { Sidebar } from './layout/sidebar.tsx';
import { ThemePicker } from './theme/theme-picker.tsx';

/**
 * The banner below the header while the stream of the page is down. Messages and new agents fail until the server is
 * back. It stays in view while the page scrolls.
 */
const ConnectionBanner = () => (
  <Alert variant="destructive" className="rounded-none border-x-0 border-t-0">
    <AlertDescription className="text-destructive">
      Server not reachable. Messages and new agents fail until it is back.
    </AlertDescription>
  </Alert>
);

/**
 * Returns the open chat among the attached sessions `sessions`, or `undefined` while no chat is open, with the function
 * that opens the chat of a session by its id. The open chat lives in state, not in the URL. Once the sessions are
 * known, the chat `orchestrator` of the orchestrator session that attached last opens whenever the open chat is not
 * among them, such as at load or once the open chat detaches. With no attached session, no chat is open.
 */
const useOpenChat = (
  sessions: readonly ListedSession[] | undefined,
): [open: Chat | undefined, setOpenId: (sessionId: string | undefined) => void] => {
  const [openId, setOpenId] = useState<string>();
  const open = sessions === undefined ? undefined : listChats(sessions).find((chat) => chat.sessionId === openId);
  if (sessions !== undefined && open === undefined) {
    const fallback = defaultChat(sessions)?.sessionId;
    if (fallback !== openId) {
      setOpenId(fallback);
    }
  }
  return [open, setOpenId];
};

/**
 * The app: the header, the banner while the stream is down, and below them the sidebar beside the main column. The
 * main column stays empty until the sessions are known. Then it shows the open chat, or the line that no agent is
 * attached while no chat is open. The app fills the window, and the window never scrolls: the sidebar, the tabs of the
 * header and the main column each scroll inside themselves. On a narrow screen the sidebar is a row above the main
 * column.
 */
const Shell = () => {
  const { online } = useConnection();
  const { repository, sessions, tasks, messages, readSessions } = usePageData();
  const [open, setOpenId] = useOpenChat(sessions);
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <PageHeader repository={repository?.name} tasks={tasks ?? []} />
      {!online && <ConnectionBanner />}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <ScrollArea className="shrink-0 border-b bg-sidebar text-sidebar-foreground md:w-60 md:border-r md:border-b-0">
          <Sidebar sessions={sessions ?? []} open={open} onOpen={setOpenId} readSessions={readSessions} />
        </ScrollArea>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {sessions !== undefined &&
            (open === undefined ? (
              <NoChat />
            ) : (
              <ConsolePage
                key={open.sessionId}
                chat={open}
                messages={messages}
                online={online}
                onOpen={setOpenId}
                readSessions={readSessions}
              />
            ))}
        </main>
      </div>
    </div>
  );
};

/**
 * The web app of atomic-workflow, with the theme picker at the top right of every page.
 */
export const App = () => (
  <>
    <Shell />
    <div className="absolute top-2 right-4 z-50">
      <ThemePicker />
    </div>
  </>
);
