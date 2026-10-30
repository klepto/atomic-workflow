import { LoaderCircle, Plus } from 'lucide-react';
import { useState } from 'react';
import { fetchCall } from '@/api/rpc.fetch.ts';
import { Button } from '@/components/ui/button.tsx';
import { Hint } from '@/components/ui/hint.tsx';
import { errorMessage } from '@/lib/error-message.ts';

/**
 * Result of `subagentStart`.
 */
interface SubagentStartResult {
  /**
   * Session id of the subagent that started.
   */
  readonly sessionId: string;
}

/**
 * Props of `StartAgentButton`.
 */
interface StartAgentButtonProps {
  /**
   * Whether an orchestrator session is attached, which the new subagent starts inside.
   */
  readonly ready: boolean;

  /**
   * Id of the task that the new subagent works on, or `undefined` for no task.
   */
  readonly taskId: number | undefined;

  /**
   * Opens the chat of the subagent with the session id `sessionId`, which just started.
   */
  readonly onOpen: (sessionId: string) => void;

  /**
   * Reads the sessions again. Resolves once a read that started after the call ended.
   */
  readonly readSessions: () => Promise<void>;
}

/**
 * Button `Start new agent`. A click starts a subagent with `subagentStart` inside the orchestrator session that
 * attached last, which works on the task `taskId`, or on no task while `taskId` is `undefined`. Until the subagent
 * attaches, the button is disabled and shows `Starting…`. Then it reads the sessions again with `readSessions`, and
 * opens the chat of the new subagent with `onOpen`. A failure shows its message below the button and as the note of
 * its hint until the next click. The button is disabled while `ready` is false, and its hint then says why.
 */
export const StartAgentButton = ({ ready, taskId, onOpen, readSessions }: StartAgentButtonProps) => {
  const [starting, setStarting] = useState(false);
  const [failure, setFailure] = useState<string>();

  /**
   * Starts the subagent, then reads the sessions again and opens its chat.
   */
  const start = async () => {
    setFailure(undefined);
    setStarting(true);
    try {
      const { sessionId } = await fetchCall<SubagentStartResult>(
        'subagentStart',
        taskId === undefined ? {} : { taskId },
      );
      await readSessions();
      onOpen(sessionId);
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="flex shrink-0 flex-col justify-center gap-1">
      <Hint
        description={taskId === undefined ? 'Start a new agent on no task' : `Start a new agent on task ${taskId}`}
        note={failure ?? (ready ? (starting ? 'The agent is starting' : undefined) : 'No main session is attached')}
      >
        <Button variant="outline" size="sm" className="md:w-full" disabled={!ready || starting} onClick={start}>
          {starting ? (
            <>
              <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />
              Starting…
            </>
          ) : (
            <>
              <Plus aria-hidden="true" />
              Start new agent
            </>
          )}
        </Button>
      </Hint>
      {failure !== undefined && (
        <p role="alert" className="text-destructive text-xs">
          {failure}
        </p>
      )}
    </div>
  );
};
